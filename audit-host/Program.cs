using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using WebAudit.Postgres;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();

var oidcAuthority = builder.Configuration["AuditHost:Oidc:Authority"];
var useOidc = !string.IsNullOrWhiteSpace(oidcAuthority);
if (useOidc)
{
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority = oidcAuthority;
            options.Audience = builder.Configuration["AuditHost:Oidc:Audience"];
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateAudience = !string.IsNullOrWhiteSpace(builder.Configuration["AuditHost:Oidc:Audience"]),
            };
        });
    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("AuditAdmin", p => p.RequireRole("AuditAdmin", "admin"));
        options.AddPolicy("AuditOperator", p => p.RequireRole("AuditOperator", "AuditAdmin", "operator", "admin"));
    });
}

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("audit-write", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = builder.Configuration.GetValue("AuditHost:RateLimit:PermitPerMinute", 60);
        opt.QueueLimit = 0;
    });
});

var otlp = builder.Configuration["AuditHost:OpenTelemetry:OtlpEndpoint"];
if (!string.IsNullOrWhiteSpace(otlp))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService("audit-host"))
        .WithTracing(t => t.AddAspNetCoreInstrumentation().AddOtlpExporter(o => o.Endpoint = new Uri(otlp)))
        .WithMetrics(m => m.AddAspNetCoreInstrumentation().AddOtlpExporter(o => o.Endpoint = new Uri(otlp)));
}

var rootDir = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, ".."));
var runnerDirRaw = builder.Configuration["AuditHost:RunnerDirectory"];
var runnerDir = string.IsNullOrWhiteSpace(runnerDirRaw) ? Path.Combine(rootDir, "runner") : runnerDirRaw!;
var dataDirRaw = builder.Configuration["AuditHost:DataDirectory"];
var dataDir = string.IsNullOrWhiteSpace(dataDirRaw) ? builder.Environment.ContentRootPath : dataDirRaw!;
Directory.CreateDirectory(dataDir);
var dbPath = Path.Combine(dataDir, "audit-host.db");

Directory.CreateDirectory(builder.Environment.ContentRootPath);
var pgConn = builder.Configuration["AuditHost:Postgres:ConnectionString"];
var externalWorker = builder.Configuration.GetValue("AuditHost:Postgres:ExternalWorkerOnly", false);
var jobSecret = builder.Configuration["AuditHost:Postgres:JobPayloadSecretKeyBase64"];

if (string.IsNullOrWhiteSpace(pgConn))
    AuditDb.InitDb(dbPath);
else
    PostgresAudit.EnsureSchema(pgConn.Trim());

// Startup reconciliation: mark any jobs stuck in 'running'/'queued' from a previous crash as 'error'.
var reconcileMaxAgeMinutes = builder.Configuration.GetValue("AuditHost:Reconcile:MaxAgeMinutes", 120);
if (string.IsNullOrWhiteSpace(pgConn))
    AuditDb.ReconcileStuckJobs(dbPath, runnerDir, reconcileMaxAgeMinutes);
else
    PostgresAudit.ReconcileStuckJobs(pgConn.Trim(), runnerDir, reconcileMaxAgeMinutes);

var auditOptions = new AuditHostOptions(
    dbPath,
    runnerDir,
    builder.Configuration,
    string.IsNullOrWhiteSpace(pgConn) ? null : pgConn.Trim(),
    externalWorker,
    string.IsNullOrWhiteSpace(jobSecret) ? null : jobSecret.Trim());

builder.Services.AddSingleton(auditOptions);
builder.Services.AddHostedService<RetentionHostedService>();

// IJobStore DI — eliminates SQLite/Postgres duplication in AuditHandlers.
if (string.IsNullOrWhiteSpace(pgConn))
    builder.Services.AddSingleton<WebAudit.Core.IJobStore>(new SqliteJobStore(dbPath, runnerDir));
else
    builder.Services.AddSingleton<WebAudit.Core.IJobStore>(new WebAudit.Postgres.PostgresJobStore(pgConn.Trim(), runnerDir));

// Not (TR): Bu yapılandırmayı değiştirirken ortam değişkenleriyle (Docker/K8s) çakışmadığından emin olun.
// Note (EN): When adjusting configuration, ensure it remains consistent with environment overrides (Docker/K8s).

var app = builder.Build();
var configuration = app.Configuration;

// Warn on startup when no authentication is configured (production risk).
var startupApiKey = builder.Configuration["AuditHost:ApiKey"] ?? Environment.GetEnvironmentVariable("AUDIT_HOST_API_KEY");
if (!useOidc && string.IsNullOrWhiteSpace(startupApiKey))
{
    var startupLogger = app.Services.GetRequiredService<ILogger<Program>>();
    startupLogger.LogWarning("SECURITY WARNING: No API key or OIDC configured. All audit endpoints are publicly accessible. Set AUDIT_HOST_API_KEY or AuditHost:Oidc:Authority to enable authentication.");
}

if (useOidc)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

app.UseExceptionHandler();
app.UseRateLimiter();

app.Use(async (ctx, next) =>
{
    if (configuration.GetValue("AuditHost:DataResidency:Enforce", false))
    {
        var allowed = configuration["AuditHost:DataResidency:AllowedRegion"] ?? "TR";
        var path = ctx.Request.Path.Value ?? "";
        var touchesAudits = path.Contains("/audits", StringComparison.OrdinalIgnoreCase);
        var isWrite = HttpMethods.IsPost(ctx.Request.Method) || HttpMethods.IsDelete(ctx.Request.Method)
            || (HttpMethods.IsPut(ctx.Request.Method) && touchesAudits);
        if (touchesAudits && isWrite)
        {
            var region = ctx.Request.Headers["X-Data-Region"].FirstOrDefault();
            if (!string.Equals(region, allowed, StringComparison.OrdinalIgnoreCase))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                ctx.Response.ContentType = "application/json";
                await ctx.Response.WriteAsJsonAsync(new { error = "Veri bolgesi uyuşmuyor.", expectedRegion = allowed });
                return;
            }
        }
    }

    await next();
});

app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    var needsApiKey = path.StartsWith("/api/audits", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/api/v1/audits", StringComparison.OrdinalIgnoreCase);
    if (needsApiKey)
    {
        var expected = configuration["AuditHost:ApiKey"] ?? Environment.GetEnvironmentVariable("AUDIT_HOST_API_KEY");
        if (!string.IsNullOrWhiteSpace(expected))
        {
            var provided = ctx.Request.Headers["X-Api-Key"].FirstOrDefault() ?? AuditDb.ExtractBearer(ctx.Request.Headers.Authorization.ToString());
            var providedBytes = Encoding.UTF8.GetBytes(provided ?? "");
            var expectedBytes = Encoding.UTF8.GetBytes(expected);
            if (!CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                ctx.Response.ContentType = "application/problem+json";
                await ctx.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
                {
                    Title = "Yetkisiz",
                    Status = StatusCodes.Status401Unauthorized,
                    Type = "https://httpstatuses.com/401",
                    Detail = "Gecerli X-Api-Key veya Authorization: Bearer gerekli."
                });
                return;
            }
        }
    }

    await next();
});

// Security response headers
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    ctx.Response.Headers.Append("X-Frame-Options", "DENY");
    ctx.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    ctx.Response.Headers.Append("Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';");
    ctx.Response.Headers.Append("X-XSS-Protection", "0");
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var name = ctx.File.Name;
        if (name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
            ctx.Context.Response.Headers.Append("Cache-Control", "no-cache, no-store, must-revalidate");
    },
});

void MapHealth(string prefix)
{
    app.MapGet($"{prefix}/health", () => Results.Ok(new { ok = true })).WithTags("health");
}

MapHealth("/api");
MapHealth("/api/v1");

app.MapGet("/health/live", () => Results.Ok(new { status = "live" })).WithTags("health");
app.MapGet("/health/ready", () =>
{
    try
    {
        if (auditOptions.UsePostgres && auditOptions.PostgresConnectionString is { } pgc)
            PostgresAudit.Ping(pgc);
        else
            using (AuditDb.Open(dbPath)) { }
        return Results.Ok(new { status = "ready" });
    }
    catch
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
}).WithTags("health");

void MapAuditRoutes(string prefix)
{
    var g = app.MapGroup(prefix).WithTags("audits");

    RouteHandlerBuilder post = g.MapPost("/audits", async (CreateAuditRequest req, CancellationToken ct, IHostApplicationLifetime lifetime, WebAudit.Core.IJobStore store) =>
        await AuditHandlers.PostAudit(req, ct, auditOptions, lifetime, store));
    post = post.RequireRateLimiting("audit-write");
    if (useOidc)
        post = post.RequireAuthorization("AuditOperator");

    g.MapGet("/audits/current", () => AuditHandlers.GetCurrent(auditOptions));
    g.MapGet("/audits/recent", (int? limit) => AuditHandlers.GetRecent(limit, auditOptions));
    g.MapGet("/audits", (int? limit) => AuditHandlers.GetAll(limit, auditOptions));
    g.MapGet("/audits/{id}/summary", (string id) => AuditHandlers.GetSummary(id, auditOptions));
    g.MapGet("/audits/{id}/findings/normalized", (string id) => AuditHandlers.GetNormalizedFindings(id, auditOptions));
    g.MapGet("/audits/{id}/pdf", (string id) => AuditHandlers.GetPdf(id, auditOptions));
    g.MapGet("/audits/{id}/json/{file}", (string id, string file) => AuditHandlers.GetJsonFile(id, file, auditOptions));
    g.MapGet("/audits/{id}/sarif", (string id) => AuditHandlers.GetSarif(id, auditOptions));
    g.MapPost("/audits/{id}/delete", (string id) => AuditHandlers.DeleteAudit(id, auditOptions));
    g.MapDelete("/audits/{id}", (string id) => AuditHandlers.DeleteAudit(id, auditOptions));
}

MapAuditRoutes("/api");
MapAuditRoutes("/api/v1");

app.Run();

/// <summary>Integration tests (see AuditHost.Tests).</summary>
public partial class Program;

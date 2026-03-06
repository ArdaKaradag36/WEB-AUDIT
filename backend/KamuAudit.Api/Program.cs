using System.Diagnostics;
using System.Text;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Application.Services;
using KamuAudit.Api.Infrastructure.Auth;
using KamuAudit.Api.Infrastructure.Ingestion;
using KamuAudit.Api.Infrastructure.Monitoring;
using KamuAudit.Api.Infrastructure.Persistence;
using KamuAudit.Api.Infrastructure.Runner;
using KamuAudit.Api.Infrastructure;
using KamuAudit.Api.Infrastructure.Security;
using KamuAudit.Api.Infrastructure.Idempotency;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.OpenApi.Models;
using Serilog;
using Serilog.Formatting.Compact;
using Serilog.Context;
using System.Security.Claims;

// Bu dosya, ASP.NET Core Web API giriş noktasını ve servis konfigürasyonunu içerir.

var builder = WebApplication.CreateBuilder(args);

// Serilog: JSON console output
builder.Host.UseSerilog((ctx, lc) =>
{
    lc.ReadFrom.Configuration(ctx.Configuration)
      .Enrich.FromLogContext()
      .WriteTo.Console(new CompactJsonFormatter());
});

// DbContext ve health checks
builder.Services.AddDb(builder.Configuration);

// DataProtection (used for encrypting sensitive credentials)
builder.Services.AddDataProtection();

// Runner konfigürasyonu ve background servisler
builder.Services.Configure<AuditRunnerOptions>(builder.Configuration.GetSection("Runner"));
builder.Services.Configure<RetentionOptions>(builder.Configuration.GetSection("Retention"));
builder.Services.Configure<IdempotencyOptions>(builder.Configuration.GetSection("Idempotency"));
builder.Services.AddScoped<IAuditRunService, AuditRunService>();
builder.Services.AddSingleton<ICredentialProtector, DataProtectionCredentialProtector>();
builder.Services.AddScoped<IAuditRunner, NodeAuditRunner>();
builder.Services.AddScoped<IAuditResultIngestor, AuditResultIngestor>();
builder.Services.AddScoped<IReportingService, ReportingService>();
builder.Services.AddHostedService<AuditRunnerBackgroundService>();
builder.Services.AddHostedService<RetentionCleanupBackgroundService>();
builder.Services.AddHostedService<IdempotencyCleanupBackgroundService>();

// OpenTelemetry tracing & ActivitySource
builder.Services.AddObservability(builder.Configuration);

// Rate limiting configuration (per IP for sensitive endpoints)
builder.Services.AddRateLimiting(builder.Configuration);

// CORS configuration for frontends
var corsSection = builder.Configuration.GetSection("Cors");
var corsEnabled = corsSection.GetValue<bool?>("Enabled") ?? false;
var allowedOrigins = corsSection.GetSection("AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

// Rate limiting enabled flag (also used at middleware level)
var rateSection = builder.Configuration.GetSection("RateLimiting");
var rateLimitingEnabled = rateSection.GetValue<bool?>("Enabled") ?? true;

if (corsEnabled && allowedOrigins.Length > 0)
{
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("FrontendCors", policy =>
        {
            policy.WithOrigins(allowedOrigins)
                  .WithMethods("GET", "POST", "DELETE", "OPTIONS")
                  .WithHeaders("Content-Type", "Authorization")
                  .DisallowCredentials();
        });
    });
}

// JWT auth & authorization
builder.Services.AddJwtAuth(builder.Configuration);

// ProblemDetails factory + controller tabanlı API
builder.Services.AddSingleton<ProblemDetailsFactory, KamuAudit.Api.Infrastructure.Errors.ApiProblemDetailsFactory>();
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var factory = context.HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateValidationProblemDetails(context.HttpContext, context.ModelState);
            return new ObjectResult(problem)
            {
                StatusCode = problem.Status ?? StatusCodes.Status400BadRequest,
                ContentTypes = { "application/problem+json" }
            };
        };
    });

// Swagger (only for development; with JWT auth support)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "KamuAudit API",
        Version = "v1"
    });

    var securityScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "JWT Bearer token. Örnek: \"Bearer {token}\""
    };

    c.AddSecurityDefinition("Bearer", securityScheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { securityScheme, Array.Empty<string>() }
    });
});

var app = builder.Build();

// Swagger sadece Development ortamında aktif
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// Attach standard logging scope and record simple API latency metrics.
app.Use(async (ctx, next) =>
{
    var activity = Activity.Current;
    var traceId = activity?.TraceId.ToString() ?? ctx.TraceIdentifier;
    var spanId = activity?.SpanId.ToString() ?? string.Empty;

    var userId = ctx.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    ctx.Request.RouteValues.TryGetValue("id", out var auditIdObj);
    var auditRunId = auditIdObj?.ToString();

    var stopwatch = Stopwatch.StartNew();

    using (LogContext.PushProperty("Service", "api"))
    using (LogContext.PushProperty("TraceId", traceId))
    using (LogContext.PushProperty("SpanId", spanId))
    using (LogContext.PushProperty("UserId", userId ?? string.Empty))
    using (LogContext.PushProperty("AuditRunId", auditRunId ?? string.Empty))
    {
        try
        {
            await next();
        }
        finally
        {
            stopwatch.Stop();
            AuditMetrics.AddApiRequestDuration(stopwatch.ElapsedMilliseconds);
        }
    }
});

if (rateLimitingEnabled)
{
    app.UseRateLimiter();
}

if (corsEnabled && allowedOrigins.Length > 0)
{
    app.UseCors("FrontendCors");
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthAndMetrics();

app.Run();


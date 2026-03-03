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
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Serilog;
using Serilog.Formatting.Compact;
using Serilog.Context;

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

// Runner konfigürasyonu ve background servis
builder.Services.Configure<AuditRunnerOptions>(builder.Configuration.GetSection("Runner"));
builder.Services.Configure<RetentionOptions>(builder.Configuration.GetSection("Retention"));
builder.Services.AddScoped<IAuditRunService, AuditRunService>();
builder.Services.AddSingleton<ICredentialProtector, DataProtectionCredentialProtector>();
builder.Services.AddScoped<IAuditRunner, NodeAuditRunner>();
builder.Services.AddScoped<IAuditResultIngestor, AuditResultIngestor>();
builder.Services.AddHostedService<AuditRunnerBackgroundService>();
builder.Services.AddHostedService<RetentionCleanupBackgroundService>();

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
                  .WithMethods("GET", "POST", "OPTIONS")
                  .WithHeaders("Content-Type", "Authorization")
                  .DisallowCredentials();
        });
    });
}

// JWT auth & authorization
builder.Services.AddJwtAuth(builder.Configuration);

// Controller tabanlı API
builder.Services.AddControllers();

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Swagger'ı tüm ortamlarda açıyoruz; erişim sadece lokal geliştirici makinesinde.
app.UseSwagger();
app.UseSwaggerUI();

app.UseHttpsRedirection();

// Add TraceId/SpanId to Serilog log context for HTTP requests
app.Use(async (ctx, next) =>
{
    var activity = Activity.Current;
    if (activity is not null)
    {
        using (LogContext.PushProperty("TraceId", activity.TraceId.ToString()))
        using (LogContext.PushProperty("SpanId", activity.SpanId.ToString()))
        {
            await next();
        }
    }
    else
    {
        await next();
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


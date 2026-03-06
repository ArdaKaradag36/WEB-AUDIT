using System.Diagnostics;
using System.Text;
using KamuAudit.Api.Infrastructure.Monitoring;
using KamuAudit.Api.Infrastructure.Persistence;
using KamuAudit.Api.Infrastructure.Runner;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using System.Threading.RateLimiting;

namespace KamuAudit.Api.Infrastructure;

public static class StartupExtensions
{
    public static IServiceCollection AddDb(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<KamuAuditDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("Default");
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException(
                    "Connection string 'Default' is not set. For local development run: dotnet user-secrets set \"ConnectionStrings:Default\" \"Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=YOUR_PASSWORD\". For production use environment variable ConnectionStrings__Default.");
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsAssembly(typeof(KamuAuditDbContext).Assembly.FullName);
            });
        });

        services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
            .AddDbContextCheck<KamuAuditDbContext>("dbcontext", tags: ["ready"]);

        return services;
    }

    public static IServiceCollection AddJwtAuth(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtKey = configuration["Jwt:Key"] ?? configuration["Jwt:Secret"];
        if (string.IsNullOrWhiteSpace(jwtKey))
            throw new InvalidOperationException(
                "Jwt:Key is not set. For local development use: dotnet user-secrets set \"Jwt:Key\" \"YOUR_SECRET_KEY_AT_LEAST_32_CHARS\". For production set environment variable Jwt__Key (double underscore).");
        if (jwtKey.Length < 32)
            throw new InvalidOperationException($"Jwt:Key must be at least 32 characters (current: {jwtKey.Length}).");
        if (jwtKey.Length < 64)
            Console.WriteLine("[JWT] Warning: Jwt:Key is shorter than 64 characters; consider using a longer key for production.");

        var jwtKeyBytes = Encoding.UTF8.GetBytes(jwtKey);
        var jwtIssuer = configuration["Jwt:Issuer"] ?? "KamuAudit.Api";
        var jwtAudience = configuration["Jwt:Audience"] ?? "KamuAudit";
        var jwtExpiryHours = int.TryParse(configuration["Jwt:ExpiryHours"], out var jwtExpiry) ? jwtExpiry : 24;

        services.AddSingleton(new Auth.JwtSettings
        {
            SigningKeyBytes = jwtKeyBytes,
            Issuer = jwtIssuer,
            Audience = jwtAudience,
            ExpiryHours = jwtExpiryHours
        });

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(jwtKeyBytes),
                ValidIssuer = jwtIssuer,
                ValidAudience = jwtAudience,
                ValidateIssuer = true,
                ValidateAudience = true,
                ClockSkew = TimeSpan.Zero
            };
        });

        services.AddAuthorization(options =>
        {
            options.AddPolicy("AuditUsers", p => p.RequireRole("QA", "Developer", "Security", "Admin"));
        });

        return services;
    }

    public static IServiceCollection AddRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var rateSection = configuration.GetSection("RateLimiting");
        var rateLimitingEnabled = rateSection.GetValue<bool?>("Enabled") ?? true;
        var authLimitPerMinute = rateSection.GetValue<int?>("Auth") ?? 10;
        var auditCreateLimitPerMinute = rateSection.GetValue<int?>("AuditCreate") ?? 5;

        if (!rateLimitingEnabled)
        {
            return services;
        }

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = Microsoft.AspNetCore.Http.StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, token) =>
            {
                var httpContext = context.HttpContext;
                var loggerFactory = httpContext.RequestServices.GetRequiredService<ILoggerFactory>();
                var logger = loggerFactory.CreateLogger("RateLimiting");

                var path = httpContext.Request.Path.ToString();
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

                logger.LogInformation("Rate limit triggered for path {Path} and IP {Ip}.", path, ip);

                var retryAfterSeconds = 60;
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    retryAfterSeconds = (int)Math.Ceiling(retryAfter.TotalSeconds);
                }

                httpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                httpContext.Response.Headers["Retry-After"] = retryAfterSeconds.ToString();

                var factory = httpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
                var problem = factory.CreateProblemDetails(
                    httpContext,
                    statusCode: StatusCodes.Status429TooManyRequests,
                    title: "Too Many Requests",
                    detail: "Rate limit exceeded. Please retry after the specified delay.",
                    instance: path);
                problem.Extensions["errorCode"] = "RATE_LIMITED";
                problem.Extensions["retryAfterSeconds"] = retryAfterSeconds;

                httpContext.Response.ContentType = "application/problem+json";
                await httpContext.Response.WriteAsJsonAsync(problem, token);
            };

            options.AddPolicy("AuthPolicy", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(
                    ip,
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = authLimitPerMinute,
                        Window = TimeSpan.FromMinutes(1),
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                        QueueLimit = 0
                    });
            });

            options.AddPolicy("AuditCreatePolicy", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(
                    ip,
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = auditCreateLimitPerMinute,
                        Window = TimeSpan.FromMinutes(1),
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                        QueueLimit = 0
                    });
            });
        });

        return services;
    }

    public static IServiceCollection AddObservability(this IServiceCollection services, IConfiguration configuration)
    {
        const string serviceName = "KamuAudit.Api";

        services.AddOpenTelemetry()
            .WithTracing(tracerProviderBuilder =>
            {
                tracerProviderBuilder
                    .SetResourceBuilder(ResourceBuilder.CreateDefault().AddService(serviceName))
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation()
                    .AddSource("KamuAudit.Backend");

                var otlpEndpoint =
                    configuration["OTEL_EXPORTER_OTLP_ENDPOINT"] ??
                    Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT");

                if (!string.IsNullOrWhiteSpace(otlpEndpoint))
                {
                    tracerProviderBuilder.AddOtlpExporter(otlp =>
                    {
                        otlp.Endpoint = new Uri(otlpEndpoint);

                        var headers =
                            configuration["OTEL_EXPORTER_OTLP_HEADERS"] ??
                            Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_HEADERS");
                        if (!string.IsNullOrWhiteSpace(headers))
                        {
                            otlp.Headers = headers;
                        }
                    });
                }
                else
                {
                    tracerProviderBuilder.AddConsoleExporter();
                }
            });

        services.AddSingleton(new ActivitySource("KamuAudit.Backend"));

        return services;
    }

    public static IEndpointRouteBuilder MapHealthAndMetrics(this IEndpointRouteBuilder app)
    {
        app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
        {
            Predicate = c => c.Tags.Contains("live")
        }).ExcludeFromDescription();

        app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
        {
            Predicate = c => c.Tags.Contains("ready")
        }).ExcludeFromDescription();

        app.MapGet("/metrics", async (KamuAuditDbContext db, CancellationToken ct) =>
        {
            var queued = await db.AuditRuns.CountAsync(a => a.Status == "queued", ct);
            var running = await db.AuditRuns.CountAsync(a => a.Status == "running", ct);
            var completed = await db.AuditRuns.CountAsync(a => a.Status == "completed", ct);
            var failed = await db.AuditRuns.CountAsync(a => a.Status == "failed", ct);

            var snapshot = AuditMetrics.Snapshot();

            var sb = new StringBuilder();
            sb.AppendLine("# HELP audit_queue_depth Number of queued audit runs");
            sb.AppendLine("# TYPE audit_queue_depth gauge");
            sb.AppendLine($"audit_queue_depth {queued}");

            sb.AppendLine("# HELP audit_running_count Number of running audit runs");
            sb.AppendLine("# TYPE audit_running_count gauge");
            sb.AppendLine($"audit_running_count {running}");

            sb.AppendLine("# HELP audit_runs_total Total audit runs by final status");
            sb.AppendLine("# TYPE audit_runs_total counter");
            sb.AppendLine($"audit_runs_total{{status=\"completed\"}} {completed}");
            sb.AppendLine($"audit_runs_total{{status=\"failed\"}} {failed}");

            sb.AppendLine("# HELP audit_runs_started_total Total number of audit run attempts started");
            sb.AppendLine("# TYPE audit_runs_started_total counter");
            sb.AppendLine($"audit_runs_started_total {snapshot.RunsStartedTotal}");

            sb.AppendLine("# HELP audit_runs_retries_total Total number of audit run retries (re-queued attempts)");
            sb.AppendLine("# TYPE audit_runs_retries_total counter");
            sb.AppendLine($"audit_runs_retries_total {snapshot.RunsRetriesTotal}");

            sb.AppendLine("# HELP audit_ingestion_failures_total Total number of ingestion attempts that could not read reports");
            sb.AppendLine("# TYPE audit_ingestion_failures_total counter");
            sb.AppendLine($"audit_ingestion_failures_total {snapshot.IngestionFailuresTotal}");

            sb.AppendLine("# HELP audit_runner_timeouts_total Total number of runner process timeouts");
            sb.AppendLine("# TYPE audit_runner_timeouts_total counter");
            sb.AppendLine($"audit_runner_timeouts_total {snapshot.RunnerTimeoutsTotal}");

            sb.AppendLine("# HELP audit_run_duration_ms Duration of completed audit runs in milliseconds");
            sb.AppendLine("# TYPE audit_run_duration_ms summary");
            sb.AppendLine($"audit_run_duration_ms_count {snapshot.RunDurationCount}");
            sb.AppendLine($"audit_run_duration_ms_sum {snapshot.RunDurationSumMs}");

            sb.AppendLine("# HELP api_request_duration_seconds Duration of API HTTP requests in seconds");
            sb.AppendLine("# TYPE api_request_duration_seconds summary");
            sb.AppendLine($"api_request_duration_seconds_count {snapshot.ApiRequestDurationCount}");
            sb.AppendLine($"api_request_duration_seconds_sum {snapshot.ApiRequestDurationSumMs / 1000.0:F6}");

            sb.AppendLine("# HELP ingestion_duration_seconds Duration of audit result ingestion in seconds");
            sb.AppendLine("# TYPE ingestion_duration_seconds summary");
            sb.AppendLine($"ingestion_duration_seconds_count {snapshot.IngestionDurationCount}");
            sb.AppendLine($"ingestion_duration_seconds_sum {snapshot.IngestionDurationSumMs / 1000.0:F6}");

            sb.AppendLine("# HELP idempotency_conflicts_total Total number of idempotency-key conflicts");
            sb.AppendLine("# TYPE idempotency_conflicts_total counter");
            sb.AppendLine($"idempotency_conflicts_total {snapshot.IdempotencyConflictsTotal}");

            sb.AppendLine("# HELP runner_audit_duration_ms Duration of runner audits in milliseconds");
            sb.AppendLine("# TYPE runner_audit_duration_ms summary");
            sb.AppendLine($"runner_audit_duration_ms_count {snapshot.RunDurationCount}");
            sb.AppendLine($"runner_audit_duration_ms_sum {snapshot.RunDurationSumMs}");

            sb.AppendLine("# HELP runner_pages_scanned_total Total pages scanned by runner");
            sb.AppendLine("# TYPE runner_pages_scanned_total counter");
            sb.AppendLine($"runner_pages_scanned_total {snapshot.RunnerPagesScannedTotal}");

            sb.AppendLine("# HELP runner_requests_total Total HTTP requests observed by runner");
            sb.AppendLine("# TYPE runner_requests_total counter");
            sb.AppendLine($"runner_requests_total {snapshot.RunnerRequestsTotal}");

            sb.AppendLine("# HELP runner_requests_failed_total Total failed HTTP requests observed by runner");
            sb.AppendLine("# TYPE runner_requests_failed_total counter");
            sb.AppendLine($"runner_requests_failed_total {snapshot.RunnerRequestsFailedTotal}");

            sb.AppendLine("# HELP runner_skipped_network_total Total network operations skipped by policy in runner");
            sb.AppendLine("# TYPE runner_skipped_network_total counter");
            sb.AppendLine($"runner_skipped_network_total{{reason=\"NETWORK_POLICY\"}} {snapshot.RunnerSkippedNetworkTotal}");

            sb.AppendLine("# HELP runner_findings_total Total findings emitted by runner, by severity");
            sb.AppendLine("# TYPE runner_findings_total counter");
            foreach (var kv in snapshot.RunnerFindingsBySeverity)
            {
                sb.AppendLine($"runner_findings_total{{severity=\"{kv.Key}\"}} {kv.Value}");
            }

            return sb.ToString();
        }).AllowAnonymous().ExcludeFromDescription();

        return app;
    }
}


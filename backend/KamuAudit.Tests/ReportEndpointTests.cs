using System.Net;
using System.Net.Http.Json;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using KamuAudit.Api;
using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Persistence;
using KamuAudit.Api.Infrastructure.Runner;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace KamuAudit.Tests;

/// <summary>
/// Integration tests for the consolidated report endpoint using Testcontainers PostgreSQL.
/// </summary>
public sealed class ReportEndpointTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private string _runnerRoot = null!;

    public ReportEndpointTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit_report")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

        _runnerRoot = Path.Combine(Path.GetTempPath(), "KamuAuditReportTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_runnerRoot);

        var jwtKey = "THIS_IS_A_TEST_ONLY_JWT_KEY_WITH_MINIMUM_32_CHARS_LENGTH!";

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((context, config) =>
                {
                    var settings = new Dictionary<string, string?>
                    {
                        ["ConnectionStrings:Default"] = _postgresContainer.GetConnectionString(),
                        ["Jwt:Key"] = jwtKey,
                        ["Runner:WorkingDirectory"] = _runnerRoot,
                        ["Runner:NodePath"] = "node",
                        ["Runner:CliScript"] = "dist/cli.js",
                        ["Runner:MaxRunDurationMinutes"] = "5"
                    };

                    config.AddInMemoryCollection(settings!);
                });

                builder.ConfigureServices(services =>
                {
                    var existing = services.FirstOrDefault(d => d.ServiceType == typeof(IAuditRunner));
                    if (existing is not null)
                    {
                        services.Remove(existing);
                    }

                    services.AddSingleton<IAuditRunner>(sp =>
                    {
                        var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<AuditRunnerOptions>>();
                        return new ReportFakeAuditRunner(options.Value);
                    });

                    services.PostConfigure<AuditRunnerOptions>(opts =>
                    {
                        opts.MaxConcurrentRuns = 1;
                        opts.MaxAttempts = 1;
                    });
                });
            });

        _client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        await _postgresContainer.StopAsync();
        await _postgresContainer.DisposeAsync();

        if (!string.IsNullOrWhiteSpace(_runnerRoot) && Directory.Exists(_runnerRoot))
        {
            try
            {
                Directory.Delete(_runnerRoot, recursive: true);
            }
            catch
            {
                // ignore cleanup errors in tests
            }
        }
    }

    [Fact]
    public async Task ReportEndpoint_Returns_Consolidated_Json_With_Skipped_Breakdown()
    {
        // 1) Register + login
        var registerRequest = new
        {
            email = "report@example.com",
            password = "Report123!",
            role = "QA"
        };

        var registerResponse = await _client.PostAsJsonAsync("/api/auth/register", registerRequest);
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);

        var loginRequest = new
        {
            email = registerRequest.email,
            password = registerRequest.password
        };

        var loginResponse = await _client.PostAsJsonAsync("/api/auth/login", loginRequest);
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        var loginBody = await loginResponse.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(loginBody);
        Assert.False(string.IsNullOrWhiteSpace(loginBody!.Token));

        using var authClient = _factory.CreateClient();
        authClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", loginBody.Token);

        // 2) Create audit
        var createAuditRequest = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com"
        };

        var createAuditResponse = await authClient.PostAsJsonAsync("/api/Audits", createAuditRequest);
        Assert.Equal(HttpStatusCode.Created, createAuditResponse.StatusCode);

        var createdAudit = await createAuditResponse.Content.ReadFromJsonAsync<AuditRunDetailDto>();
        Assert.NotNull(createdAudit);
        var auditId = createdAudit!.Id;

        // 3) Wait for fake runner + ingestion to complete
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            var sw = System.Diagnostics.Stopwatch.StartNew();
            while (sw.Elapsed < TimeSpan.FromSeconds(30))
            {
                var run = await db.AuditRuns
                    .Include(a => a.Findings)
                    .FirstOrDefaultAsync(a => a.Id == auditId);

                if (run is not null && run.Status == "completed" && run.Findings.Any())
                {
                    break;
                }

                await Task.Delay(500);
            }
        }

        // 4) Call report endpoint
        var reportResponse = await authClient.GetAsync($"/api/Audits/{auditId}/report?format=json");
        Assert.Equal(HttpStatusCode.OK, reportResponse.StatusCode);

        var report = await reportResponse.Content.ReadFromJsonAsync<AuditReportResponse>();
        Assert.NotNull(report);
        Assert.Equal(auditId, report!.AuditRunId);
        Assert.Equal("https://example.com", report.TargetUrl);
        Assert.True(report.ExecSummary.TotalFindings > 0);
        Assert.True(report.SkippedSummary.TotalSkipped > 0);
        Assert.True(report.SkippedSummary.ByReason.TryGetValue("NETWORK_POLICY", out var count) && count > 0);
    }

    private sealed class ReportFakeAuditRunner : IAuditRunner
    {
        private readonly AuditRunnerOptions _options;

        public ReportFakeAuditRunner(AuditRunnerOptions options)
        {
            _options = options;
        }

        public async Task<bool> RunAsync(AuditRun run, AuditCredentialContext? credential, string runDirRelative, CancellationToken cancellationToken = default)
        {
            var workingDirectory = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, _options.WorkingDirectory));

            var runDirFull = Path.GetFullPath(Path.Combine(workingDirectory, runDirRelative));
            Directory.CreateDirectory(runDirFull);

            var summaryJson = """
                {
                  "run": {},
                  "findings": [
                    {
                      "ruleId": "R-ERR",
                      "severity": "error",
                      "category": "network",
                      "title": "Network failure",
                      "detail": "Request failed",
                      "status": "FAILED",
                      "confidence": 0.9
                    },
                    {
                      "ruleId": "R-SKIP",
                      "severity": "info",
                      "category": "network",
                      "title": "Skipped by policy",
                      "detail": "Skipped by network policy",
                      "status": "SKIPPED",
                      "skipReason": "NETWORK_POLICY",
                      "confidence": 0.8
                    }
                  ],
                  "metrics": {
                    "durationMs": 500,
                    "linkSampled": 1,
                    "linkBroken": 0
                  }
                }
                """;

            var gapsJson = """
                {"gaps":[]}
                """;

            await File.WriteAllTextAsync(Path.Combine(runDirFull, "summary.json"), summaryJson, cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(runDirFull, "gaps.json"), gapsJson, cancellationToken);

            return true;
        }
    }
}


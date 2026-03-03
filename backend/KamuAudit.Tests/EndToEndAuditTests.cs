using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using KamuAudit.Api;
using KamuAudit.Api.Application.Interfaces;
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
/// End-to-end integration test that exercises:
/// - Auth (register/login)
/// - POST /api/Audits
/// - Background worker execution
/// - Runner invocation (mocked)
/// - Ingestion of findings/gaps
/// - Status transitions queued -> running -> completed
/// </summary>
public sealed class EndToEndAuditTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private string _runnerRoot = null!;

    public EndToEndAuditTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

        _runnerRoot = Path.Combine(Path.GetTempPath(), "KamuAuditE2E", Guid.NewGuid().ToString("N"));
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
                    // Replace real IAuditRunner with a fast, deterministic fake.
                    var existing = services.FirstOrDefault(d => d.ServiceType == typeof(IAuditRunner));
                    if (existing is not null)
                    {
                        services.Remove(existing);
                    }

                    services.AddSingleton<IAuditRunner>(sp =>
                    {
                        var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<AuditRunnerOptions>>();
                        return new FakeAuditRunner(options.Value);
                    });

                    // Keep worker conservative for tests.
                    services.PostConfigure<AuditRunnerOptions>(opts =>
                    {
                        opts.MaxConcurrentRuns = 1;
                        opts.MaxAttempts = 1;
                    });
                });
            });

        _client = _factory.CreateClient();

        // Apply migrations to the ephemeral Postgres instance.
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
    public async Task EndToEnd_Auth_Audit_Run_Ingestion_Works()
    {
        // 1) Register user
        var registerRequest = new
        {
            email = "e2e@example.com",
            password = "Test123!e2e",
            role = "QA"
        };

        var registerResponse = await _client.PostAsJsonAsync("/api/auth/register", registerRequest);
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);

        // 2) Login
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

        // 3) Create audit
        using var authClient = _factory.CreateClient();
        authClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", loginBody.Token);

        var createAuditRequest = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com"
        };

        var createAuditResponse = await authClient.PostAsJsonAsync("/api/Audits", createAuditRequest);
        Assert.Equal(HttpStatusCode.Created, createAuditResponse.StatusCode);

        var createdAudit = await createAuditResponse.Content.ReadFromJsonAsync<AuditRunDetailDto>();
        Assert.NotNull(createdAudit);
        var auditId = createdAudit!.Id;
        Assert.NotEqual(Guid.Empty, auditId);

        // 4) Wait for background worker to process the run
        var sw = Stopwatch.StartNew();
        AuditRun? auditFromDb = null;

        while (sw.Elapsed < TimeSpan.FromSeconds(30))
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            auditFromDb = await db.AuditRuns.Include(a => a.Findings).Include(a => a.Gaps)
                .FirstOrDefaultAsync(a => a.Id == auditId);

            if (auditFromDb is not null && (auditFromDb.Status == "completed" || auditFromDb.Status == "failed"))
            {
                break;
            }

            await Task.Delay(500);
        }

        Assert.NotNull(auditFromDb);
        Assert.Equal("completed", auditFromDb!.Status);

        // 5) Verify ingestion persisted findings and gaps
        Assert.NotNull(auditFromDb.Findings);
        Assert.NotNull(auditFromDb.Gaps);
        Assert.True(auditFromDb.Findings.Count > 0, "Expected at least one Finding to be ingested.");
        Assert.True(auditFromDb.Gaps.Count > 0, "Expected at least one Gap to be ingested.");
    }

    [Fact]
    public async Task Unauthorized_Call_To_CreateAudit_Returns401()
    {
        var client = _factory.CreateClient();

        var body = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com"
        };

        var response = await client.PostAsJsonAsync("/api/Audits", body);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private sealed class FakeAuditRunner : IAuditRunner
    {
        private readonly AuditRunnerOptions _options;

        public FakeAuditRunner(AuditRunnerOptions options)
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
                {"run":{},"findings":[{"ruleId":"e2e-rule","severity":"error","category":"console","title":"E2E Finding","detail":"Details"}],"metrics":{"durationMs":1000,"linkSampled":1,"linkBroken":0}}
                """;

            var gapsJson = """
                {"gaps":[{"elementId":"e2e-element","humanName":"E2E Button","reasonCode":"NOT_VISIBLE","riskLevel":"medium","recommendedScript":"// e2e"}]}
                """;

            await File.WriteAllTextAsync(Path.Combine(runDirFull, "summary.json"), summaryJson, cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(runDirFull, "gaps.json"), gapsJson, cancellationToken);

            // Simulate successful run (exitCode 0/2 equivalent).
            return true;
        }
    }
}


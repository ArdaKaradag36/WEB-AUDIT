using System.Threading.Tasks;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using KamuAudit.Api;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Persistence;
using KamuAudit.Api.Infrastructure.Runner;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace KamuAudit.Tests;

public sealed class RetentionCleanupTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private WebApplicationFactory<Program> _factory = null!;

    public RetentionCleanupTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit_retention")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((context, config) =>
                {
                    var settings = new Dictionary<string, string?>
                    {
                        ["ConnectionStrings:Default"] = _postgresContainer.GetConnectionString(),
                        ["Jwt:Key"] = "THIS_IS_A_TEST_ONLY_JWT_KEY_WITH_MINIMUM_32_CHARS_LENGTH!",
                        ["Retention:Enabled"] = "true",
                        ["Retention:AuditRunsDays"] = "1",
                        ["Retention:ArtifactsDays"] = "1",
                        ["Retention:DryRun"] = "false",
                    };

                    config.AddInMemoryCollection(settings!);
                });
            });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        _factory.Dispose();
        await _postgresContainer.StopAsync();
        await _postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task Cleanup_Removes_Old_Runs_And_Artifacts()
    {
        Guid runId;
        string runDirFull;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            var options = scope.ServiceProvider.GetRequiredService<IOptions<AuditRunnerOptions>>();

            var baseDir = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, options.Value.WorkingDirectory));

            var run = new AuditRun
            {
                Id = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-10),
                TargetUrl = "https://example.com",
                Status = "completed",
                SafeMode = true,
                MaxLinks = 20,
                MaxUiAttempts = 30,
                Strict = false,
                Browser = "chromium",
                Plugins = "[]",
                FinishedAt = DateTimeOffset.UtcNow.AddDays(-9),
            };

            var relativeRunDir = Path.Combine("reports", "runs", run.Id.ToString("N"));
            run.RunDir = relativeRunDir;

            runId = run.Id;
            runDirFull = Path.GetFullPath(Path.Combine(baseDir, relativeRunDir));
            Directory.CreateDirectory(runDirFull);

            db.AuditRuns.Add(run);
            await db.SaveChangesAsync();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var cleanup = scope.ServiceProvider.GetRequiredService<RetentionCleanupBackgroundService>();

            var method = typeof(RetentionCleanupBackgroundService)
                .GetMethod("RunCleanupAsync", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
            Assert.NotNull(method);

            await (Task)method!.Invoke(cleanup, new object[] { CancellationToken.None })!;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            var remaining = await db.AuditRuns.FirstOrDefaultAsync(a => a.Id == runId);
            Assert.Null(remaining);
        }

        Assert.False(Directory.Exists(runDirFull));
    }

    [Fact]
    public async Task DryRun_DoesNot_Delete_Data_Or_Files()
    {
        Guid runId;
        string runDirFull;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            var options = scope.ServiceProvider.GetRequiredService<IOptions<AuditRunnerOptions>>();

            var baseDir = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, options.Value.WorkingDirectory));

            var run = new AuditRun
            {
                Id = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-10),
                TargetUrl = "https://example.com",
                Status = "completed",
                SafeMode = true,
                MaxLinks = 20,
                MaxUiAttempts = 30,
                Strict = false,
                Browser = "chromium",
                Plugins = "[]",
                FinishedAt = DateTimeOffset.UtcNow.AddDays(-9),
            };

            var relativeRunDir = Path.Combine("reports", "runs", run.Id.ToString("N"));
            run.RunDir = relativeRunDir;

            runId = run.Id;
            runDirFull = Path.GetFullPath(Path.Combine(baseDir, relativeRunDir));
            Directory.CreateDirectory(runDirFull);

            db.AuditRuns.Add(run);
            await db.SaveChangesAsync();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var cleanup = scope.ServiceProvider.GetRequiredService<RetentionCleanupBackgroundService>();
            var retentionOptions = scope.ServiceProvider.GetRequiredService<IOptionsSnapshot<RetentionOptions>>();

            // Enable DryRun at runtime
            var options = retentionOptions.Value;
            options.DryRun = true;

            var method = typeof(RetentionCleanupBackgroundService)
                .GetMethod("RunCleanupAsync", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
            Assert.NotNull(method);

            await (Task)method!.Invoke(cleanup, new object[] { CancellationToken.None })!;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            var remaining = await db.AuditRuns.FirstOrDefaultAsync(a => a.Id == runId);
            Assert.NotNull(remaining);
        }

        Assert.True(Directory.Exists(runDirFull));
    }
}


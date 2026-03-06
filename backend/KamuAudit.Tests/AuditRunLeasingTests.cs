using System.Net;
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
using Xunit;

namespace KamuAudit.Tests;

public sealed class AuditRunLeasingTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private WebApplicationFactory<Program> _factory = null!;

    public AuditRunLeasingTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit_leasing")
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
    public async Task Concurrency_TwoWorkers_DoNotReserveSameRun()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

            var run = new AuditRun
            {
                Id = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.UtcNow,
                TargetUrl = "https://example.com",
                Status = "queued",
                SafeMode = true,
                MaxLinks = 20,
                MaxUiAttempts = 30,
                Strict = false,
                Browser = "chromium",
                Plugins = "[]"
            };

            db.AuditRuns.Add(run);
            await db.SaveChangesAsync();
        }

        var leaseDuration = TimeSpan.FromSeconds(60);

        async Task<Guid?> ReserveAsync(string workerId)
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            var reserved = await AuditRunLeasing.TryReserveNextAsync(db, workerId, leaseDuration);
            return reserved?.Id;
        }

        var t1 = ReserveAsync("worker-1");
        var t2 = ReserveAsync("worker-2");

        await Task.WhenAll(t1, t2);

        var ids = new[] { t1.Result, t2.Result }.Where(id => id.HasValue).Select(id => id!.Value).ToList();

        // Exactly one worker should have reserved the run.
        Assert.Single(ids.Distinct());
    }

    [Fact]
    public async Task Zombie_Run_With_Expired_Lease_Is_Reacquired()
    {
        Guid runId;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

            var run = new AuditRun
            {
                Id = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
                TargetUrl = "https://example.com",
                Status = "running",
                SafeMode = true,
                MaxLinks = 20,
                MaxUiAttempts = 30,
                Strict = false,
                Browser = "chromium",
                Plugins = "[]",
                LeaseOwner = "old-worker",
                LeaseUntil = DateTimeOffset.UtcNow.AddMinutes(-5),
                LeaseVersion = 1
            };

            db.AuditRuns.Add(run);
            await db.SaveChangesAsync();
            runId = run.Id;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();
            var leaseDuration = TimeSpan.FromSeconds(60);

            var reacquired = await AuditRunLeasing.TryReserveNextAsync(db, "new-worker", leaseDuration);

            Assert.NotNull(reacquired);
            Assert.Equal(runId, reacquired!.Id);
            Assert.Equal("running", reacquired.Status);
            Assert.Equal("new-worker", reacquired.LeaseOwner);
            Assert.True(reacquired.LeaseUntil > DateTimeOffset.UtcNow);
            Assert.True(reacquired.LeaseVersion >= 2);
        }
    }
}


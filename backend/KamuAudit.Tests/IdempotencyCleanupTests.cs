using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using KamuAudit.Api;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace KamuAudit.Tests;

public sealed class IdempotencyCleanupTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private WebApplicationFactory<Program> _factory = null!;

    public IdempotencyCleanupTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit_idem_cleanup")
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
                        ["Idempotency:RetentionHours"] = "24",
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
    public async Task CleanupService_Removes_Expired_Keys()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "cleanup@example.com",
            PasswordHash = "x",
            Role = "QA",
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Users.Add(user);

        var expired = new IdempotencyKey
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Key = "expired-key",
            RequestHash = "HASH",
            AuditRunId = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow.AddHours(-48),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(-24),
        };
        var fresh = new IdempotencyKey
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Key = "fresh-key",
            RequestHash = "HASH",
            AuditRunId = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(24),
        };
        db.IdempotencyKeys.AddRange(expired, fresh);
        await db.SaveChangesAsync();

        // Invoke cleanup manually via the hosted service type.
        var cleanup = scope.ServiceProvider.GetRequiredService<KamuAudit.Api.Infrastructure.Idempotency.IdempotencyCleanupBackgroundService>();

        // Call the internal purge method via reflection (for test only).
        var method = typeof(KamuAudit.Api.Infrastructure.Idempotency.IdempotencyCleanupBackgroundService)
            .GetMethod("PurgeExpiredKeysAsync", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
        Assert.NotNull(method);

        await (Task)method!.Invoke(cleanup, new object[] { CancellationToken.None })!;

        var remaining = await db.IdempotencyKeys.ToListAsync();
        Assert.Single(remaining);
        Assert.Equal("fresh-key", remaining[0].Key);
    }
}


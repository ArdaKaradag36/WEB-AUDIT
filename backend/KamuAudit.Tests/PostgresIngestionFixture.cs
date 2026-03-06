using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace KamuAudit.Tests;

/// <summary>
/// Shared PostgreSQL container fixture for ingestion/dedup tests.
/// Uses the real Npgsql provider instead of InMemory to mirror production behavior.
/// </summary>
public sealed class PostgresIngestionFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container;

    public PostgresIngestionFixture()
    {
        _container = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit_ingestion")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _container.DisposeAsync();
    }

    public KamuAuditDbContext CreateContext(bool resetDatabase = false)
    {
        var options = new DbContextOptionsBuilder<KamuAuditDbContext>()
            .UseNpgsql(_container.GetConnectionString())
            .Options;

        var db = new KamuAuditDbContext(options);

        if (resetDatabase)
        {
            db.Database.EnsureDeleted();
        }

        db.Database.EnsureCreated();
        return db;
    }
}

[CollectionDefinition("postgres-ingestion")]
public sealed class PostgresIngestionCollection : ICollectionFixture<PostgresIngestionFixture>
{
}


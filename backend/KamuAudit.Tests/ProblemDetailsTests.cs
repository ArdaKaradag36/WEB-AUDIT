using System.Net;
using System.Net.Http.Json;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using KamuAudit.Api;
using KamuAudit.Api.Contracts.Requests;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace KamuAudit.Tests;

public sealed class ProblemDetailsTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private WebApplicationFactory<Program> _factory = null!;

    public ProblemDetailsTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit_problem")
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
        var db = scope.ServiceProvider.GetRequiredService<KamuAudit.Api.Infrastructure.Persistence.KamuAuditDbContext>();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        _factory.Dispose();
        await _postgresContainer.StopAsync();
        await _postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task BadRequest_Uses_ProblemDetails()
    {
        var client = _factory.CreateClient();

        // Missing required TargetUrl -> model validation 400
        var body = new { };

        var response = await client.PostAsJsonAsync("/api/Audits", body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(StatusCodes.Status400BadRequest, problem!.Status);
        Assert.Contains("traceId", problem.Extensions.Keys);
    }

    [Fact]
    public async Task NotFound_Uses_ProblemDetails()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/Audits/{Guid.NewGuid():N}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(StatusCodes.Status404NotFound, problem!.Status);
        Assert.Contains("traceId", problem.Extensions.Keys);
    }
}


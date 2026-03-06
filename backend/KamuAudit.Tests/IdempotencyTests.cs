using System.Net;
using System.Net.Http.Json;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using KamuAudit.Api;
using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace KamuAudit.Tests;

public sealed class IdempotencyTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public IdempotencyTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithDatabase("kamu_audit_idem")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

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
                    };

                    config.AddInMemoryCollection(settings!);
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
    }

    [Fact]
    public async Task ExpiredKey_Allows_NewAuditCreation()
    {
        var token = await RegisterAndLoginAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

        // Seed an expired idempotency key for this user.
        var user = await db.Users.SingleAsync(u => u.Email == "idem@example.com");
        var expiredKey = new KamuAudit.Api.Domain.Entities.IdempotencyKey
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Key = "expired-key",
            RequestHash = "DUMMY",
            AuditRunId = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow.AddHours(-48),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(-24),
        };
        db.IdempotencyKeys.Add(expiredKey);
        await db.SaveChangesAsync();

        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("Idempotency-Key", "expired-key");

        var body = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com",
            MaxLinks = 5,
        };

        var response = await client.PostAsJsonAsync("/api/Audits", body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<AuditRunDetailDto>();
        Assert.NotNull(dto);
    }

    private async Task<string> RegisterAndLoginAsync()
    {
        var registerRequest = new
        {
            email = "idem@example.com",
            password = "Idem123!",
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

        return loginBody.Token;
    }

    [Fact]
    public async Task SameKeySameBody_ReturnsSameAuditRunId()
    {
        var token = await RegisterAndLoginAsync();

        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var key = "test-idem-key-1";
        client.DefaultRequestHeaders.Add("Idempotency-Key", key);

        var body = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com",
            MaxLinks = 10,
        };

        // First request: expect 201 Created
        var first = await client.PostAsJsonAsync("/api/Audits", body);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstDto = await first.Content.ReadFromJsonAsync<AuditRunDetailDto>();
        Assert.NotNull(firstDto);

        // Second request with same key + same body: expect 200 OK with same Id
        var second = await client.PostAsJsonAsync("/api/Audits", body);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var secondDto = await second.Content.ReadFromJsonAsync<AuditRunDetailDto>();
        Assert.NotNull(secondDto);

        Assert.Equal(firstDto!.Id, secondDto!.Id);
    }

    [Fact]
    public async Task SameKeyDifferentBody_Returns409Conflict()
    {
        var token = await RegisterAndLoginAsync();

        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var key = "test-idem-key-2";
        client.DefaultRequestHeaders.Add("Idempotency-Key", key);

        var body1 = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com",
            MaxLinks = 10,
        };

        var body2 = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com",
            MaxLinks = 20,
        };

        var first = await client.PostAsJsonAsync("/api/Audits", body1);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/Audits", body2);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var problem = await second.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(StatusCodes.Status409Conflict, problem!.Status);
        Assert.Equal("IDEMPOTENCY_CONFLICT", problem.Extensions["errorCode"] as string);
    }
}


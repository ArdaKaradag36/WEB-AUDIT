using System.Net;
using System.Net.Http.Json;
using KamuAudit.Api;
using KamuAudit.Api.Contracts.Requests;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace KamuAudit.Tests;

public sealed class ValidationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ValidationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Register_InvalidEmail_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var body = new RegisterRequest
        {
            Email = "not-an-email",
            Password = "StrongPass123!",
            Role = "QA"
        };

        var response = await client.PostAsJsonAsync("/api/auth/register", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateAudit_InvalidTargetUrl_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        // No auth here; we only want to assert model validation kicks in before auth.
        var body = new CreateAuditRunRequest
        {
            TargetUrl = "not-a-url"
        };

        var response = await client.PostAsJsonAsync("/api/Audits", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateAudit_InvalidMaxLinks_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var body = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com",
            MaxLinks = 0 // below allowed range
        };

        var response = await client.PostAsJsonAsync("/api/Audits", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateAudit_TooLongTargetUrl_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var longUrl = "https://example.com/" + new string('a', 5000);
        var body = new CreateAuditRunRequest
        {
            TargetUrl = longUrl
        };

        var response = await client.PostAsJsonAsync("/api/Audits", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateAudit_TargetUrl_With_Quotes_And_Newlines_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var body = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com/\"bad\nurl"
        };

        var response = await client.PostAsJsonAsync("/api/Audits", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateAudit_TooManyPlugins_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var plugins = string.Join(",", Enumerable.Range(0, 50).Select(i => $"plugin-{i}"));
        var body = new CreateAuditRunRequest
        {
            TargetUrl = "https://example.com",
            Plugins = plugins
        };

        var response = await client.PostAsJsonAsync("/api/Audits", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}


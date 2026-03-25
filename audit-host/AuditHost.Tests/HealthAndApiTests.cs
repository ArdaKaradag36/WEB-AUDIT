using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace AuditHost.Tests;

public class HealthAndApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public HealthAndApiTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task HealthLive_ReturnsOk()
    {
        var r = await _client.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    [Fact]
    public async Task HealthReady_ReturnsOk_WhenDbInitialized()
    {
        var r = await _client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    [Fact]
    public async Task ApiV1Health_ReturnsOk()
    {
        var r = await _client.GetAsync("/api/v1/health");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var body = await r.Content.ReadFromJsonAsync<HealthOk>();
        Assert.NotNull(body);
        Assert.True(body.ok);
    }

    [Fact]
    public async Task Current_ReturnsJson_WithCurrentProperty()
    {
        var r = await _client.GetAsync("/api/v1/audits/current");
        r.EnsureSuccessStatusCode();
        var doc = await r.Content.ReadFromJsonAsync<CurrentResponse>();
        Assert.NotNull(doc);
    }

    private sealed record HealthOk(bool ok);
    private sealed record CurrentResponse(object? current);
}

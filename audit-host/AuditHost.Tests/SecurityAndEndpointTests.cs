using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AuditHost.Tests;

/// <summary>
/// Tests covering: SSRF validation, API key enforcement, DELETE endpoint,
/// file access guard, security headers, and data residency middleware.
/// </summary>
public class SecurityAndEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SecurityAndEndpointTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    // ── SSRF validation ──────────────────────────────────────────────────────

    [Theory]
    [InlineData("http://169.254.169.254/latest/meta-data/")]
    [InlineData("http://10.0.0.1/admin")]
    [InlineData("http://192.168.1.1/")]
    [InlineData("http://127.0.0.1/")]
    [InlineData("http://[::1]/")]
    public async Task PostAudit_RejectsPrivateIpTargets(string privateUrl)
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/v1/audits", new { targetUrl = privateUrl });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PostAudit_RejectsEmptyTargetUrl()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/v1/audits", new { targetUrl = "" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PostAudit_RejectsInvalidLoginMode()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/v1/audits", new
        {
            targetUrl = "https://example.com",
            loginMode = "magic",
            identifier = "u",
            password = "p"
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PostAudit_RejectsLoginModeWithoutCredentials()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/v1/audits", new
        {
            targetUrl = "https://example.com",
            loginMode = "email"
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    // ── API key enforcement ──────────────────────────────────────────────────

    [Fact]
    public async Task ApiKey_Rejects_WrongKey()
    {
        var client = _factory.WithWebHostBuilder(b =>
            b.UseSetting("AuditHost:ApiKey", "correct-key-abc"))
            .CreateClient();

        client.DefaultRequestHeaders.Add("X-Api-Key", "wrong-key");
        var resp = await client.GetAsync("/api/v1/audits/current");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task ApiKey_Accepts_CorrectKey()
    {
        var client = _factory.WithWebHostBuilder(b =>
            b.UseSetting("AuditHost:ApiKey", "correct-key-abc"))
            .CreateClient();

        client.DefaultRequestHeaders.Add("X-Api-Key", "correct-key-abc");
        var resp = await client.GetAsync("/api/v1/audits/current");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task ApiKey_Accepts_Bearer_Header()
    {
        var client = _factory.WithWebHostBuilder(b =>
            b.UseSetting("AuditHost:ApiKey", "bearer-test-key"))
            .CreateClient();

        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "bearer-test-key");
        var resp = await client.GetAsync("/api/v1/audits/current");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    // ── DELETE endpoint ──────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteAudit_Returns404_ForNonExistentId()
    {
        var client = _factory.CreateClient();
        var resp = await client.DeleteAsync("/api/v1/audits/nonexistentid12345");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task DeleteAudit_PostDelete_Returns404_ForNonExistentId()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsync("/api/v1/audits/nonexistentid12345/delete", null);
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── File access guard ────────────────────────────────────────────────────

    [Theory]
    [InlineData("../../../etc/passwd")]
    [InlineData("..%2F..%2Fetc%2Fpasswd")]
    [InlineData("evil_file")]
    [InlineData("run")]
    public async Task GetJsonFile_RejectsUnsupportedFileName(string unsafeFile)
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync($"/api/v1/audits/somejob/json/{unsafeFile}");
        // Must not succeed; allowed is 400 (unsupported file name) or 404 (job/file not found).
        // 405 is also acceptable if the path resolved to a different route.
        Assert.True(
            resp.StatusCode == HttpStatusCode.BadRequest ||
            resp.StatusCode == HttpStatusCode.NotFound ||
            resp.StatusCode == HttpStatusCode.MethodNotAllowed,
            $"Expected 400/404/405, got {resp.StatusCode} for file '{unsafeFile}'");
    }

    [Theory]
    [InlineData("summary")]
    [InlineData("report")]
    [InlineData("console")]
    public async Task GetJsonFile_AllowsExpectedFileNames(string allowedFile)
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync($"/api/v1/audits/nonexistentjob/json/{allowedFile}");
        // Should be 404 (job not found), not 400 (disallowed file name)
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── Security headers ─────────────────────────────────────────────────────

    [Fact]
    public async Task Response_IncludesSecurityHeaders()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/health/live");
        Assert.True(resp.Headers.Contains("X-Content-Type-Options"),
            "Missing X-Content-Type-Options header");
        Assert.True(resp.Headers.Contains("X-Frame-Options"),
            "Missing X-Frame-Options header");
    }

    // ── SARIF endpoint ───────────────────────────────────────────────────────

    [Fact]
    public async Task GetSarif_Returns404_ForNonExistentJob()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/v1/audits/nonexistentjob/sarif");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}

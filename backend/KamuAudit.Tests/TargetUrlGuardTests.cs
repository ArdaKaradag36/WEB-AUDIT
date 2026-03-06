using System;
using KamuAudit.Api.Infrastructure.Security;
using Xunit;

namespace KamuAudit.Tests;

public sealed class TargetUrlGuardTests
{
    // Block: localhost variants

    [Theory]
    [InlineData("http://localhost")]
    [InlineData("http://localhost/")]
    [InlineData("http://LocalHost")]
    [InlineData("http://localhost.")]
    public void Blocks_localhost_hosts(string url)
    {
        var uri = new Uri(url);
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }

    // Block: 127.0.0.1 and loopback

    [Theory]
    [InlineData("http://127.0.0.1")]
    [InlineData("http://127.0.0.1/")]
    [InlineData("http://user@127.0.0.1")]
    public void Blocks_loopback_ipv4(string url)
    {
        var uri = new Uri(url);
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }

    // Block: ::1 and IPv6 loopback

    [Theory]
    [InlineData("http://[::1]")]
    [InlineData("http://[::1]/")]
    public void Blocks_loopback_ipv6(string url)
    {
        var uri = new Uri(url);
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }

    // Block: metadata and link-local ranges 169.254.0.0/16

    [Theory]
    [InlineData("http://169.254.169.254")]   // AWS
    [InlineData("http://169.254.1.1")]      // other link-local
    public void Blocks_metadata_and_linklocal_ipv4(string url)
    {
        var uri = new Uri(url);
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }

    // Block: RFC1918 private ranges

    [Theory]
    [InlineData("http://10.0.0.1")]
    [InlineData("http://10.255.255.255")]
    [InlineData("http://172.16.0.1")]
    [InlineData("http://172.31.255.254")]
    [InlineData("http://192.168.0.1")]
    [InlineData("http://192.168.255.254")]
    public void Blocks_rfc1918_private_ranges(string url)
    {
        var uri = new Uri(url);
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }

    // Block: IPv6 link-local and unique-local

    [Theory]
    [InlineData("http://[fe80::1]")]       // link-local
    [InlineData("http://[fe80::abcd]")]    // link-local
    [InlineData("http://[fc00::1]")]       // unique local
    [InlineData("http://[fd00::1234]")]    // unique local
    public void Blocks_ipv6_linklocal_and_unique_local(string url)
    {
        var uri = new Uri(url);
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }

    // Allow: normal public hosts

    [Theory]
    [InlineData("https://example.com")]
    [InlineData("https://www.nvi.gov.tr/")]
    [InlineData("http://EXAMPLE.com")]
    public void Allows_public_hosts(string url)
    {
        var uri = new Uri(url);
        Assert.True(TargetUrlGuard.IsAllowed(uri));
    }

    // Tricky: username@host is evaluated by host part only.

    [Fact]
    public void Blocks_username_at_private_host()
    {
        var uri = new Uri("http://user@192.168.1.10");
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }

    [Fact]
    public void Allows_username_at_public_host()
    {
        var uri = new Uri("http://user@example.com");
        Assert.True(TargetUrlGuard.IsAllowed(uri));
    }

    // Non-http schemes are rejected.

    [Theory]
    [InlineData("ftp://example.com")]
    [InlineData("file:///etc/passwd")]
    public void Rejects_non_http_schemes(string url)
    {
        var uri = new Uri(url);
        Assert.False(TargetUrlGuard.IsAllowed(uri));
    }
}


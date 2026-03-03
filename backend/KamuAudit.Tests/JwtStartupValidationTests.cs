using System;
using System.Collections.Generic;
using KamuAudit.Api.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace KamuAudit.Tests;

public sealed class JwtStartupValidationTests
{
    [Fact]
    public void AddJwtAuth_Throws_When_Key_Missing()
    {
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        Assert.Throws<InvalidOperationException>(() => services.AddJwtAuth(config));
    }

    [Fact]
    public void AddJwtAuth_Throws_When_Key_TooShort()
    {
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "short-key"
            }!)
            .Build();

        var ex = Assert.Throws<InvalidOperationException>(() => services.AddJwtAuth(config));
        Assert.Contains("at least 32 characters", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AddJwtAuth_Succeeds_With_Strong_Key()
    {
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "THIS_IS_A_STRONG_TEST_KEY_WITH_AT_LEAST_32_CHARS"
            }!)
            .Build();

        services.AddJwtAuth(config);
    }
}


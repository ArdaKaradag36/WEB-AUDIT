using System.Text.Json;
using KamuAudit.Api.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace KamuAudit.Api.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext; PostgreSQL üzerinde audit verisini tutar.
/// </summary>
public sealed class KamuAuditDbContext : DbContext
{
    public KamuAuditDbContext(DbContextOptions<KamuAuditDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<SystemEntity> Systems => Set<SystemEntity>();
    public DbSet<AuditRun> AuditRuns => Set<AuditRun>();
    public DbSet<Finding> Findings => Set<Finding>();
    public DbSet<Gap> Gaps => Set<Gap>();
    public DbSet<AuditTargetCredential> AuditTargetCredentials => Set<AuditTargetCredential>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Users
        builder.Entity<User>(entity =>
        {
            entity.ToTable("users");

            entity.HasKey(u => u.Id);

            entity.Property(u => u.Email)
                .IsRequired()
                .HasMaxLength(255);

            entity.HasIndex(u => u.Email)
                .IsUnique();

            entity.Property(u => u.PasswordHash)
                .IsRequired()
                .HasMaxLength(512);

            entity.Property(u => u.Role)
                .IsRequired()
                .HasMaxLength(64);

            entity.Property(u => u.CreatedAt)
                .HasDefaultValueSql("NOW()");

            entity.HasMany(u => u.AuditRuns)
                .WithOne(a => a.User)
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Systems
        builder.Entity<SystemEntity>(entity =>
        {
            entity.ToTable("systems");

            entity.HasKey(s => s.Id);

            entity.Property(s => s.Name)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(s => s.BaseUrl)
                .IsRequired()
                .HasMaxLength(500);

            entity.Property(s => s.Description)
                .HasMaxLength(2000);
        });

        // AuditRuns
        builder.Entity<AuditRun>(entity =>
        {
            entity.ToTable("audit_runs");

            entity.HasKey(a => a.Id);

            entity.Property(a => a.TargetUrl)
                .IsRequired()
                .HasMaxLength(1000);

            entity.Property(a => a.Status)
                .IsRequired()
                .HasMaxLength(32);

            entity.Property(a => a.Browser)
                .HasMaxLength(32);

            entity.Property(a => a.Plugins)
                .IsRequired()
                .HasMaxLength(2000);

            entity.Property(a => a.RunDir)
                .HasMaxLength(1000);

            entity.Property(a => a.DurationMs);
            entity.Property(a => a.LinkSampled);
            entity.Property(a => a.LinkBroken);

            entity.Property(a => a.AttemptCount)
                .HasDefaultValue(0);

            entity.Property(a => a.LastError)
                .HasMaxLength(2000);

            entity.Property(a => a.RetryAfterUtc);

            entity.HasIndex(a => a.Status);
            entity.HasIndex(a => a.SystemId);
            entity.HasIndex(a => a.UserId);

            entity.HasOne(a => a.System)
                .WithMany(s => s.AuditRuns)
                .HasForeignKey(a => a.SystemId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Findings
        builder.Entity<Finding>(entity =>
        {
            entity.ToTable("findings");

            entity.HasKey(f => f.Id);

            entity.Property(f => f.RuleId)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(f => f.Severity)
                .IsRequired()
                .HasMaxLength(32);

            entity.Property(f => f.Category)
                .IsRequired()
                .HasMaxLength(64);

            entity.Property(f => f.Title)
                .IsRequired()
                .HasMaxLength(500);

            entity.Property(f => f.Detail)
                .IsRequired();

            entity.Property(f => f.Remediation)
                .HasMaxLength(2000);

            entity.Property(f => f.Meta)
                .HasColumnType("jsonb");

            entity.HasIndex(f => f.AuditRunId);

            entity.HasOne(f => f.AuditRun)
                .WithMany(a => a.Findings)
                .HasForeignKey(f => f.AuditRunId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Gaps
        builder.Entity<Gap>(entity =>
        {
            entity.ToTable("gaps");

            entity.HasKey(g => g.Id);

            entity.Property(g => g.ElementId)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(g => g.HumanName)
                .HasMaxLength(500);

            entity.Property(g => g.ReasonCode)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(g => g.ActionHint)
                .HasMaxLength(1000);

            entity.Property(g => g.RiskLevel)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(g => g.RecommendedScript)
                .HasMaxLength(8000);

            entity.Property(g => g.Evidence)
                .HasColumnType("jsonb");

            entity.HasIndex(g => g.AuditRunId);

            entity.HasOne(g => g.AuditRun)
                .WithMany(a => a.Gaps)
                .HasForeignKey(g => g.AuditRunId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // AuditTargetCredentials
        builder.Entity<AuditTargetCredential>(entity =>
        {
            entity.ToTable("audit_target_credentials");

            entity.HasKey(c => c.Id);

            entity.Property(c => c.Username)
                .HasMaxLength(255);

            entity.Property(c => c.EncryptedPassword)
                .IsRequired()
                .HasMaxLength(4096);

            entity.Property(c => c.TwoFactorNote)
                .HasMaxLength(2000);

            entity.Property(c => c.CreatedAt)
                .HasDefaultValueSql("NOW()");

            entity.HasIndex(c => c.AuditRunId)
                .IsUnique();

            entity.HasOne(c => c.AuditRun)
                .WithOne()
                .HasForeignKey<AuditTargetCredential>(c => c.AuditRunId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}


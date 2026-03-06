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
    public DbSet<FindingTemplate> FindingTemplates => Set<FindingTemplate>();
    public DbSet<FindingInstance> FindingInstances => Set<FindingInstance>();
    public DbSet<Gap> Gaps => Set<Gap>();
    public DbSet<AuditTargetCredential> AuditTargetCredentials => Set<AuditTargetCredential>();
    public DbSet<GapTemplate> GapTemplates => Set<GapTemplate>();
    public DbSet<AuditCoverage> AuditCoverages => Set<AuditCoverage>();
    public DbSet<ElementHistory> ElementHistory => Set<ElementHistory>();
    public DbSet<IdempotencyKey> IdempotencyKeys => Set<IdempotencyKey>();

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

            entity.HasMany<IdempotencyKey>()
                .WithOne(k => k.User!)
                .HasForeignKey(k => k.UserId)
                .OnDelete(DeleteBehavior.Cascade);
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

            entity.Property(a => a.CreatedAt)
                .HasDefaultValueSql("NOW()");

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

            entity.Property(a => a.LeaseOwner)
                .HasMaxLength(200);

            entity.Property(a => a.LeaseUntil);

            entity.Property(a => a.LeaseVersion);

            // Error triage fields are currently not mapped to the database schema;
            // they are used only in-memory by the runner and DTOs.
            entity.Ignore(a => a.ErrorType);
            entity.Ignore(a => a.LastExitCode);
            entity.Ignore(a => a.RetryCount);

            entity.HasIndex(a => a.Status);
            entity.HasIndex(a => a.SystemId);
            entity.HasIndex(a => a.UserId);
            entity.HasIndex(a => a.LeaseUntil);

            entity.HasOne(a => a.System)
                .WithMany(s => s.AuditRuns)
                .HasForeignKey(a => a.SystemId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Findings (per-run)
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

            entity.Property(f => f.Confidence);

            entity.Property(f => f.Meta)
                .HasColumnType("jsonb");

            entity.Property(f => f.Status)
                .HasConversion<string>()
                .IsRequired()
                .HasMaxLength(16);

            entity.Property(f => f.SkipReason)
                .HasConversion<string>()
                .HasMaxLength(32);

            entity.HasIndex(f => f.AuditRunId);

            entity.HasOne(f => f.AuditRun)
                .WithMany(a => a.Findings)
                .HasForeignKey(f => f.AuditRunId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // FindingTemplates (deduplicated by fingerprint across runs)
        builder.Entity<FindingTemplate>(entity =>
        {
            entity.ToTable("finding_templates");

            entity.HasKey(t => t.Id);

            entity.Property(t => t.Fingerprint)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(t => t.RuleId)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(t => t.Severity)
                .IsRequired()
                .HasMaxLength(32);

            entity.Property(t => t.Category)
                .IsRequired()
                .HasMaxLength(64);

            entity.Property(t => t.Title)
                .IsRequired()
                .HasMaxLength(500);

            entity.Property(t => t.CanonicalUrl)
                .IsRequired()
                .HasMaxLength(1000);

            entity.Property(t => t.Parameter)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(t => t.Remediation)
                .HasMaxLength(2000);

            entity.Property(t => t.Meta)
                .HasColumnType("jsonb");

            entity.Property(t => t.Status)
                .HasConversion<string>()
                .IsRequired()
                .HasMaxLength(16);

            entity.Property(t => t.SkipReason)
                .HasConversion<string>()
                .HasMaxLength(32);

            entity.HasIndex(t => t.Fingerprint)
                .IsUnique();
        });

        // FindingInstances (occurrences per run)
        builder.Entity<FindingInstance>(entity =>
        {
            entity.ToTable("finding_instances");

            entity.HasKey(i => i.Id);

            entity.Property(i => i.Url)
                .IsRequired()
                .HasMaxLength(1000);

            entity.Property(i => i.Parameter)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(i => i.Status)
                .HasConversion<string>()
                .IsRequired()
                .HasMaxLength(16);

            entity.Property(i => i.SkipReason)
                .HasConversion<string>()
                .HasMaxLength(32);

            entity.HasIndex(i => i.AuditRunId);
            entity.HasIndex(i => i.FindingTemplateId);

            entity.HasOne(i => i.FindingTemplate)
                .WithMany()
                .HasForeignKey(i => i.FindingTemplateId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(i => i.AuditRun)
                .WithMany()
                .HasForeignKey(i => i.AuditRunId)
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

        // GapTemplates (normalized gaps per run)
        builder.Entity<GapTemplate>(entity =>
        {
            entity.ToTable("gap_templates");

            entity.HasKey(gt => gt.Id);

            entity.Property(gt => gt.HumanName)
                .HasMaxLength(500);

            entity.Property(gt => gt.ReasonCode)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(gt => gt.RiskLevel)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(gt => gt.OccurrenceCount);

            entity.Property(gt => gt.ExampleUrl)
                .HasMaxLength(1000);

            entity.HasIndex(gt => gt.AuditRunId);

            entity.HasOne(gt => gt.AuditRun)
                .WithMany()
                .HasForeignKey(gt => gt.AuditRunId)
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

        // AuditCoverage
        builder.Entity<AuditCoverage>(entity =>
        {
            entity.ToTable("audit_coverage");

            entity.HasKey(c => c.AuditRunId);

            entity.Property(c => c.TotalElements);
            entity.Property(c => c.TestedElements);
            entity.Property(c => c.SkippedElements);
            entity.Property(c => c.CoverageRatio);

            entity.HasOne(c => c.AuditRun)
                .WithOne()
                .HasForeignKey<AuditCoverage>(c => c.AuditRunId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ElementHistory
        builder.Entity<ElementHistory>(entity =>
        {
            entity.ToTable("element_history");

            entity.HasKey(e => e.ElementHash);

            entity.Property(e => e.ElementHash)
                .HasMaxLength(500);
        });

        // Idempotency keys
        builder.Entity<IdempotencyKey>(entity =>
        {
            entity.ToTable("idempotency_keys");

            entity.HasKey(k => k.Id);

            entity.Property(k => k.Key)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(k => k.RequestHash)
                .IsRequired()
                .HasMaxLength(128);

            entity.Property(k => k.CreatedAt)
                .IsRequired();

            entity.Property(k => k.ExpiresAt)
                .IsRequired();

            entity.HasIndex(k => new { k.UserId, k.Key })
                .IsUnique();
        });
    }
}


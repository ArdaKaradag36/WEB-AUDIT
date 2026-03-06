using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KamuAudit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditRunLeasing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "Confidence",
                table: "findings",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SkipReason",
                table: "findings",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "findings",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "audit_runs",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "NOW()");

            migrationBuilder.AddColumn<string>(
                name: "LeaseOwner",
                table: "audit_runs",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LeaseUntil",
                table: "audit_runs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LeaseVersion",
                table: "audit_runs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "audit_coverage",
                columns: table => new
                {
                    AuditRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    TotalElements = table.Column<int>(type: "integer", nullable: false),
                    TestedElements = table.Column<int>(type: "integer", nullable: false),
                    SkippedElements = table.Column<int>(type: "integer", nullable: false),
                    CoverageRatio = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_coverage", x => x.AuditRunId);
                    table.ForeignKey(
                        name: "FK_audit_coverage_audit_runs_AuditRunId",
                        column: x => x.AuditRunId,
                        principalTable: "audit_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "element_history",
                columns: table => new
                {
                    ElementHash = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    PassCount = table.Column<int>(type: "integer", nullable: false),
                    FailCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_element_history", x => x.ElementHash);
                });

            migrationBuilder.CreateTable(
                name: "finding_templates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RuleId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Category = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CanonicalUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Parameter = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Remediation = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SkipReason = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    FirstSeenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    OccurrenceCount = table.Column<long>(type: "bigint", nullable: false),
                    RecentSafeOccurrences = table.Column<int>(type: "integer", nullable: false),
                    AutoRiskLowerSuggested = table.Column<bool>(type: "boolean", nullable: false),
                    Meta = table.Column<JsonDocument>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_templates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "gap_templates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AuditRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    HumanName = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ReasonCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RiskLevel = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OccurrenceCount = table.Column<int>(type: "integer", nullable: false),
                    ExampleUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_gap_templates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_gap_templates_audit_runs_AuditRunId",
                        column: x => x.AuditRunId,
                        principalTable: "audit_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "idempotency_keys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    AuditRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_idempotency_keys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_idempotency_keys_audit_runs_AuditRunId",
                        column: x => x.AuditRunId,
                        principalTable: "audit_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_idempotency_keys_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "finding_instances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FindingTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuditRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    Url = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Parameter = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    DetectedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SkipReason = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_instances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_finding_instances_audit_runs_AuditRunId",
                        column: x => x.AuditRunId,
                        principalTable: "audit_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_finding_instances_finding_templates_FindingTemplateId",
                        column: x => x.FindingTemplateId,
                        principalTable: "finding_templates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_audit_runs_LeaseUntil",
                table: "audit_runs",
                column: "LeaseUntil");

            migrationBuilder.CreateIndex(
                name: "IX_finding_instances_AuditRunId",
                table: "finding_instances",
                column: "AuditRunId");

            migrationBuilder.CreateIndex(
                name: "IX_finding_instances_FindingTemplateId",
                table: "finding_instances",
                column: "FindingTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_finding_templates_Fingerprint",
                table: "finding_templates",
                column: "Fingerprint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_gap_templates_AuditRunId",
                table: "gap_templates",
                column: "AuditRunId");

            migrationBuilder.CreateIndex(
                name: "IX_idempotency_keys_AuditRunId",
                table: "idempotency_keys",
                column: "AuditRunId");

            migrationBuilder.CreateIndex(
                name: "IX_idempotency_keys_UserId_Key",
                table: "idempotency_keys",
                columns: new[] { "UserId", "Key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_coverage");

            migrationBuilder.DropTable(
                name: "element_history");

            migrationBuilder.DropTable(
                name: "finding_instances");

            migrationBuilder.DropTable(
                name: "gap_templates");

            migrationBuilder.DropTable(
                name: "idempotency_keys");

            migrationBuilder.DropTable(
                name: "finding_templates");

            migrationBuilder.DropIndex(
                name: "IX_audit_runs_LeaseUntil",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "Confidence",
                table: "findings");

            migrationBuilder.DropColumn(
                name: "SkipReason",
                table: "findings");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "findings");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "LeaseOwner",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "LeaseUntil",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "LeaseVersion",
                table: "audit_runs");
        }
    }
}

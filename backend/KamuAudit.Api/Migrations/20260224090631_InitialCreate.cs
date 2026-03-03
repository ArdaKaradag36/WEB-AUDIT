using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KamuAudit.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "systems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BaseUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_systems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Role = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "audit_runs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SystemId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FinishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SafeMode = table.Column<bool>(type: "boolean", nullable: false),
                    MaxLinks = table.Column<int>(type: "integer", nullable: false),
                    MaxUiAttempts = table.Column<int>(type: "integer", nullable: false),
                    Strict = table.Column<bool>(type: "boolean", nullable: false),
                    Browser = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Plugins = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    RunDir = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_runs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_audit_runs_systems_SystemId",
                        column: x => x.SystemId,
                        principalTable: "systems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "findings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AuditRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Category = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Detail = table.Column<string>(type: "text", nullable: false),
                    Remediation = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Meta = table.Column<JsonDocument>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_findings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_findings_audit_runs_AuditRunId",
                        column: x => x.AuditRunId,
                        principalTable: "audit_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "gaps",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AuditRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    ElementId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    HumanName = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ReasonCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ActionHint = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RiskLevel = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RecommendedScript = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: true),
                    Evidence = table.Column<JsonDocument>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_gaps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_gaps_audit_runs_AuditRunId",
                        column: x => x.AuditRunId,
                        principalTable: "audit_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_audit_runs_Status",
                table: "audit_runs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_audit_runs_SystemId",
                table: "audit_runs",
                column: "SystemId");

            migrationBuilder.CreateIndex(
                name: "IX_findings_AuditRunId",
                table: "findings",
                column: "AuditRunId");

            migrationBuilder.CreateIndex(
                name: "IX_gaps_AuditRunId",
                table: "gaps",
                column: "AuditRunId");

            migrationBuilder.CreateIndex(
                name: "IX_users_Email",
                table: "users",
                column: "Email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "findings");

            migrationBuilder.DropTable(
                name: "gaps");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "audit_runs");

            migrationBuilder.DropTable(
                name: "systems");
        }
    }
}

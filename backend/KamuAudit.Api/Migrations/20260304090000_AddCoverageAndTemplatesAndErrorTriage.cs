using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KamuAudit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCoverageAndTemplatesAndErrorTriage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Gap templates (normalized gaps per run)
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

            migrationBuilder.CreateIndex(
                name: "IX_gap_templates_AuditRunId",
                table: "gap_templates",
                column: "AuditRunId");

            // Audit coverage metrics
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

            // Element history (self-learning risk classification)
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

            // Structured error triage fields on audit_runs
            migrationBuilder.AddColumn<string>(
                name: "ErrorType",
                table: "audit_runs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LastExitCode",
                table: "audit_runs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RetryCount",
                table: "audit_runs",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_coverage");

            migrationBuilder.DropTable(
                name: "element_history");

            migrationBuilder.DropTable(
                name: "gap_templates");

            migrationBuilder.DropColumn(
                name: "ErrorType",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "LastExitCode",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "RetryCount",
                table: "audit_runs");
        }
    }
}


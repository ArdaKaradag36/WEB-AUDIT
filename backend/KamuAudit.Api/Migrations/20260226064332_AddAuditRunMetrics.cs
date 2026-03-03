using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KamuAudit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditRunMetrics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "DurationMs",
                table: "audit_runs",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LinkBroken",
                table: "audit_runs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LinkSampled",
                table: "audit_runs",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DurationMs",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "LinkBroken",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "LinkSampled",
                table: "audit_runs");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KamuAudit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditRunRetryFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AttemptCount",
                table: "audit_runs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "LastError",
                table: "audit_runs",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetryAfterUtc",
                table: "audit_runs",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttemptCount",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "LastError",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "RetryAfterUtc",
                table: "audit_runs");
        }
    }
}

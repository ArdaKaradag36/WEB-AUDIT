using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KamuAudit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserAuditRelationsAndCredentials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "audit_runs",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "audit_target_credentials",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AuditRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    Username = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    EncryptedPassword = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: false),
                    TwoFactorNote = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_target_credentials", x => x.Id);
                    table.ForeignKey(
                        name: "FK_audit_target_credentials_audit_runs_AuditRunId",
                        column: x => x.AuditRunId,
                        principalTable: "audit_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_audit_runs_UserId",
                table: "audit_runs",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_audit_target_credentials_AuditRunId",
                table: "audit_target_credentials",
                column: "AuditRunId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_audit_runs_users_UserId",
                table: "audit_runs",
                column: "UserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_audit_runs_users_UserId",
                table: "audit_runs");

            migrationBuilder.DropTable(
                name: "audit_target_credentials");

            migrationBuilder.DropIndex(
                name: "IX_audit_runs_UserId",
                table: "audit_runs");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "audit_runs");
        }
    }
}

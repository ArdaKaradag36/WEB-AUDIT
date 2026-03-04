using System.Security.Claims;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Contracts.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KamuAudit.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "AuditUsers")]
public sealed class ReportsController : ControllerBase
{
    private readonly IReportingService _reportingService;

    public ReportsController(IReportingService reportingService)
    {
        _reportingService = reportingService;
    }

    [HttpGet("summary")]
    public async Task<ActionResult<ReportSummaryResponse>> GetSummary(
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        CancellationToken cancellationToken = default)
    {
        var (userId, isAdmin) = GetCurrentUser();
        var summary = await _reportingService.GetSummaryAsync(userId, isAdmin, from, to, cancellationToken);
        return Ok(summary);
    }

    private (Guid? UserId, bool IsAdmin) GetCurrentUser()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? userId = null;
        if (Guid.TryParse(userIdClaim, out var parsed))
        {
            userId = parsed;
        }

        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        var isAdmin = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase);

        return (userId, isAdmin);
    }
}


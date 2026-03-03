using System.Security.Claims;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace KamuAudit.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "AuditUsers")]
public sealed class AuditsController : ControllerBase
{
    private readonly IAuditRunService _auditRunService;

    public AuditsController(IAuditRunService auditRunService)
    {
        _auditRunService = auditRunService;
    }

    [HttpPost]
    [EnableRateLimiting("AuditCreatePolicy")]
    public async Task<IActionResult> CreateAudit([FromBody] CreateAuditRunRequest request, CancellationToken cancellationToken)
    {
        var (userId, _) = GetCurrentUser();
        if (userId is null)
        {
            return Forbid();
        }

        var (detail, error) = await _auditRunService.CreateAsync(userId.Value, request, cancellationToken);
        if (error is not null)
            return BadRequest(error);
        return CreatedAtAction(nameof(GetAuditById), new { id = detail!.Id }, detail);
    }

    [HttpPost("with-credentials")]
    [EnableRateLimiting("AuditCreatePolicy")]
    public async Task<IActionResult> CreateAuditWithCredentials(
        [FromBody] CreateAuditWithCredentialsRequest request,
        CancellationToken cancellationToken)
    {
        var (userId, _) = GetCurrentUser();
        if (userId is null)
        {
            return Forbid();
        }

        var (detail, error) = await _auditRunService.CreateWithCredentialsAsync(userId.Value, request, cancellationToken);
        if (error is not null)
            return BadRequest(error);
        return CreatedAtAction(nameof(GetAuditById), new { id = detail!.Id }, detail);
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AuditRunSummaryDto>>> GetAudits(
        [FromQuery] Guid? systemId,
        [FromQuery] string? status,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        CancellationToken cancellationToken)
    {
        var (userId, isAdmin) = GetCurrentUser();
        var items = await _auditRunService.GetListAsync(userId, isAdmin, systemId, status, from, to, cancellationToken);
        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AuditRunDetailDto>> GetAuditById(Guid id, CancellationToken cancellationToken)
    {
        var (userId, isAdmin) = GetCurrentUser();
        var dto = await _auditRunService.GetByIdAsync(id, userId, isAdmin, cancellationToken);
        if (dto is null)
            return NotFound();
        return Ok(dto);
    }

    [HttpGet("{id:guid}/findings")]
    public async Task<ActionResult<PagedFindingsResponse>> GetFindings(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? severity = null,
        [FromQuery] string? category = null,
        CancellationToken cancellationToken = default)
    {
        var (response, notFound) = await _auditRunService.GetFindingsAsync(id, page, pageSize, severity, category, cancellationToken);
        if (notFound)
            return NotFound();
        return Ok(response);
    }

    [HttpGet("{id:guid}/gaps")]
    public async Task<ActionResult<PagedGapsResponse>> GetGaps(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? riskLevel = null,
        [FromQuery] string? reasonCode = null,
        CancellationToken cancellationToken = default)
    {
        var (response, notFound) = await _auditRunService.GetGapsAsync(id, page, pageSize, riskLevel, reasonCode, cancellationToken);
        if (notFound)
            return NotFound();
        return Ok(response);
    }

    [HttpGet("{id:guid}/summary")]
    public async Task<ActionResult<AuditSummaryResponse>> GetSummary(Guid id, CancellationToken cancellationToken = default)
    {
        var (userId, isAdmin) = GetCurrentUser();
        var (response, notFound) = await _auditRunService.GetSummaryAsync(id, userId, isAdmin, cancellationToken);
        if (notFound)
            return NotFound();
        return Ok(response);
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

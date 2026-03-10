using System.Security.Claims;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
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

        var idempotencyKey = Request.Headers["Idempotency-Key"].FirstOrDefault();

            var (detail, error, fromCache) = await _auditRunService.CreateAsync(userId.Value, request, idempotencyKey, cancellationToken);
        if (error is not null)
        {
            if (!string.IsNullOrWhiteSpace(idempotencyKey) &&
                error.StartsWith("Idempotency-Key already used", StringComparison.Ordinal))
            {
                    Infrastructure.Monitoring.AuditMetrics.IncrementIdempotencyConflicts();
                var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
                var problem = factory.CreateProblemDetails(
                    HttpContext,
                    statusCode: StatusCodes.Status409Conflict,
                    title: "Idempotency key conflict",
                    detail: error,
                    instance: HttpContext.Request.Path);
                problem.Extensions["errorCode"] = "IDEMPOTENCY_CONFLICT";

                return new ObjectResult(problem)
                {
                    StatusCode = problem.Status,
                    ContentTypes = { "application/problem+json" }
                };
            }

            var badRequestFactory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var badRequest = badRequestFactory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid audit create request",
                detail: error,
                instance: HttpContext.Request.Path);
            badRequest.Extensions["errorCode"] = "AUDIT_CREATE_INVALID";

            return new ObjectResult(badRequest)
            {
                StatusCode = badRequest.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        if (!string.IsNullOrWhiteSpace(idempotencyKey) && fromCache)
        {
            return Ok(detail);
        }

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

        var idempotencyKey = Request.Headers["Idempotency-Key"].FirstOrDefault();

        var (detail, error, fromCache) = await _auditRunService.CreateWithCredentialsAsync(userId.Value, request, idempotencyKey, cancellationToken);
        if (error is not null)
        {
            if (!string.IsNullOrWhiteSpace(idempotencyKey) &&
                error.StartsWith("Idempotency-Key already used", StringComparison.Ordinal))
            {
                var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
                var problem = factory.CreateProblemDetails(
                    HttpContext,
                    statusCode: StatusCodes.Status409Conflict,
                    title: "Idempotency key conflict",
                    detail: error,
                    instance: HttpContext.Request.Path);
                problem.Extensions["errorCode"] = "IDEMPOTENCY_CONFLICT";

                return new ObjectResult(problem)
                {
                    StatusCode = problem.Status,
                    ContentTypes = { "application/problem+json" }
                };
            }

            var badRequestFactory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var badRequest = badRequestFactory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid audit create request",
                detail: error,
                instance: HttpContext.Request.Path);
            badRequest.Extensions["errorCode"] = "AUDIT_CREATE_INVALID";

            return new ObjectResult(badRequest)
            {
                StatusCode = badRequest.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        if (!string.IsNullOrWhiteSpace(idempotencyKey) && fromCache)
        {
            return Ok(detail);
        }

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
        [FromQuery] string[]? severity = null,
        [FromQuery] string[]? category = null,
        [FromQuery] string[]? status = null,
        [FromQuery] string[]? skipReason = null,
        [FromQuery] string? url = null,
        [FromQuery] double? minConfidence = null,
        [FromQuery] string? sort = null,
        CancellationToken cancellationToken = default)
    {
        var (response, notFound) = await _auditRunService.GetFindingsAsync(
            id, page, pageSize, severity, category, status, skipReason, url, minConfidence, sort, cancellationToken);
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

    [HttpGet("{id:guid}/gaps.csv")]
    public async Task<IActionResult> GetGapsCsv(Guid id, CancellationToken cancellationToken = default)
    {
        var (userId, isAdmin) = GetCurrentUser();
        var (csv, notFound) = await _auditRunService.GetGapsCsvAsync(id, userId, isAdmin, cancellationToken);
        if (notFound || csv is null)
            return NotFound();

        var fileName = $"audit_{id:N}_gaps.csv";
        var bytes = System.Text.Encoding.UTF8.GetBytes(csv);
        return File(bytes, "text/csv; charset=utf-8", fileName);
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

    [HttpGet("{id:guid}/report")]
    public async Task<ActionResult<AuditReportResponse>> GetReport(Guid id, [FromQuery] string? format = "json", CancellationToken cancellationToken = default)
    {
        if (!string.Equals(format, "json", StringComparison.OrdinalIgnoreCase))
        {
            var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Unsupported report format",
                detail: "Only JSON format is currently supported.",
                instance: HttpContext.Request.Path);
            problem.Extensions["errorCode"] = "REPORT_FORMAT_UNSUPPORTED";

            return new ObjectResult(problem)
            {
                StatusCode = problem.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        var (userId, isAdmin) = GetCurrentUser();
        var (report, notFound) = await _auditRunService.GetReportAsync(id, userId, isAdmin, cancellationToken);
        if (notFound || report is null)
        {
            return NotFound();
        }

        return Ok(report);
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> CancelAudit(Guid id, CancellationToken cancellationToken = default)
    {
        var (userId, isAdmin) = GetCurrentUser();
        if (userId is null && !isAdmin)
        {
            return Forbid();
        }

        var canceled = await _auditRunService.CancelAsync(id, userId, isAdmin, cancellationToken);
        if (!canceled)
        {
            return NotFound();
        }

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAudit(Guid id, CancellationToken cancellationToken = default)
    {
        var (userId, isAdmin) = GetCurrentUser();
        if (userId is null && !isAdmin)
        {
            return Forbid();
        }

        var deleted = await _auditRunService.DeleteAsync(id, userId, isAdmin, cancellationToken);
        if (!deleted)
        {
            return NotFound();
        }

        return NoContent();
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

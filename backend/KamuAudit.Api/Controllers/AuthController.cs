using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Auth;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.RateLimiting;

namespace KamuAudit.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AuthController : ControllerBase
{
    private static readonly string[] AllowedRoles = ["QA", "Developer", "Security", "Admin"];

    private readonly KamuAuditDbContext _db;
    private readonly JwtSettings _jwt;

    public AuthController(KamuAuditDbContext db, JwtSettings jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        var role = request.Role?.Trim() ?? "QA";
        if (!AllowedRoles.Contains(role, StringComparer.OrdinalIgnoreCase))
        {
            var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid role",
                detail: "Role must be one of: " + string.Join(", ", AllowedRoles),
                instance: HttpContext.Request.Path);
            problem.Extensions["errorCode"] = "AUTH_INVALID_ROLE";

            return new ObjectResult(problem)
            {
                StatusCode = problem.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        if (await _db.Users.AnyAsync(u => u.Email == request.Email.Trim(), cancellationToken))
        {
            var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status409Conflict,
                title: "Email already registered",
                detail: "A user with this email already exists.",
                instance: HttpContext.Request.Path);
            problem.Extensions["errorCode"] = "AUTH_EMAIL_CONFLICT";

            return new ObjectResult(problem)
            {
                StatusCode = problem.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        var hasher = new Microsoft.AspNetCore.Identity.PasswordHasher<User>();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email.Trim().ToLowerInvariant(),
            PasswordHash = hasher.HashPassword(null!, request.Password),
            Role = role,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new { user.Id, user.Email, user.Role });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email.Trim().ToLowerInvariant(), cancellationToken);
        if (user is null)
        {
            var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Invalid credentials",
                detail: "Invalid email or password.",
                instance: HttpContext.Request.Path);
            problem.Extensions["errorCode"] = "AUTH_INVALID_CREDENTIALS";

            return new ObjectResult(problem)
            {
                StatusCode = problem.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        var hasher = new Microsoft.AspNetCore.Identity.PasswordHasher<User>();
        var result = hasher.VerifyHashedPassword(null!, user.PasswordHash, request.Password);
        if (result == Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed)
        {
            var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Invalid credentials",
                detail: "Invalid email or password.",
                instance: HttpContext.Request.Path);
            problem.Extensions["errorCode"] = "AUTH_INVALID_CREDENTIALS";

            return new ObjectResult(problem)
            {
                StatusCode = problem.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        var token = GenerateJwt(user);
        var expiresAt = DateTime.UtcNow.AddHours(_jwt.ExpiryHours);

        return Ok(new LoginResponse { Token = token, Email = user.Email, Role = user.Role, ExpiresAt = expiresAt });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(idClaim, out var userId))
        {
            var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Unauthorized",
                detail: "Invalid user identifier in token.",
                instance: HttpContext.Request.Path);
            problem.Extensions["errorCode"] = "AUTH_INVALID_SUB";

            return new ObjectResult(problem)
            {
                StatusCode = problem.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        var user = await _db.Users.FindAsync([userId], cancellationToken);
        if (user is null)
        {
            var factory = HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
            var problem = factory.CreateProblemDetails(
                HttpContext,
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Unauthorized",
                detail: "User not found.",
                instance: HttpContext.Request.Path);
            problem.Extensions["errorCode"] = "AUTH_USER_NOT_FOUND";

            return new ObjectResult(problem)
            {
                StatusCode = problem.Status,
                ContentTypes = { "application/problem+json" }
            };
        }

        return Ok(new { user.Id, user.Email, user.Role, user.CreatedAt });
    }

    private string GenerateJwt(User user)
    {
        var creds = new SigningCredentials(new SymmetricSecurityKey(_jwt.SigningKeyBytes), SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role)
        };

        var token = new JwtSecurityToken(
            _jwt.Issuer,
            _jwt.Audience,
            claims,
            expires: DateTime.UtcNow.AddHours(_jwt.ExpiryHours),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

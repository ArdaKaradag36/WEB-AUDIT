using System.Text;
using System.Text.Json;
using System.Diagnostics;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Monitoring;
using Microsoft.Extensions.Options;

namespace KamuAudit.Api.Infrastructure.Runner;

/// <summary>
/// Runs the Node/Playwright audit CLI (dist/cli.js) for a given audit run.
/// </summary>
public sealed class NodeAuditRunner : IAuditRunner
{
    private readonly AuditRunnerOptions _options;
    private readonly ILogger<NodeAuditRunner> _logger;
    private readonly ActivitySource _activitySource;

    public NodeAuditRunner(IOptions<AuditRunnerOptions> options, ILogger<NodeAuditRunner> logger, ActivitySource activitySource)
    {
        _options = options.Value;
        _logger = logger;
        _activitySource = activitySource;
    }

    /// <inheritdoc />
    public async Task<bool> RunAsync(AuditRun run, AuditCredentialContext? credential, string runDirRelative, CancellationToken cancellationToken = default)
    {
        using var activity = _activitySource.StartActivity("Runner.StartProcess", ActivityKind.Internal);
        if (Uri.TryCreate(run.TargetUrl, UriKind.Absolute, out var uri))
        {
            activity?.SetTag("auditRun.targetHost", uri.Host);
        }
        activity?.SetTag("auditRun.id", run.Id);

        try
        {
            // Optional development-only simulation of a hung runner without invoking Node.
            if (_options.SimulateHangSeconds is > 0)
            {
                var simulate = _options.SimulateHangSeconds.Value;
                _logger.LogWarning("Simulating runner hang for {Seconds} seconds for audit run {AuditRunId}.", simulate, run.Id);
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(simulate), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    // Background service stopping; surface as normal failure.
                }

                run.LastError = $"Runner simulated hang for {simulate} seconds.";
                run.ErrorType = "RunnerTimeout";
                run.LastExitCode = null;
                return false;
            }

            var workingDirectory = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, _options.WorkingDirectory));

            if (!Directory.Exists(workingDirectory))
            {
                _logger.LogError("Runner workingDirectory not found: {WorkingDirectory}", workingDirectory);
                run.LastError = $"Runner workingDirectory not found: {workingDirectory}";
                run.ErrorType = "Unknown";
                run.LastExitCode = null;
                return false;
            }

            var outDirArg = runDirRelative.Replace("\\", "/");

            string? pluginsCsv = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(run.Plugins) && run.Plugins != "[]")
                {
                    var arr = JsonSerializer.Deserialize<string[]>(run.Plugins) ?? Array.Empty<string>();
                    if (arr.Length > 0)
                        pluginsCsv = string.Join(",", arr);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Plugins JSON parse failed: {Plugins}", run.Plugins);
            }

            var args = new StringBuilder();
            args.Append($"\"{_options.CliScript}\" ");
            args.Append($"--url \"{run.TargetUrl}\" ");
            args.Append($"--max-links {run.MaxLinks} ");
            args.Append($"--max-ui-attempts {run.MaxUiAttempts} ");
            args.Append($"--safe-mode {(run.SafeMode ? "true" : "false")} ");
            if (!string.IsNullOrWhiteSpace(run.Browser))
                args.Append($"--browser {run.Browser} ");
            if (run.Strict)
                args.Append("--strict ");
            if (!string.IsNullOrWhiteSpace(pluginsCsv))
                args.Append($"--plugins {pluginsCsv} ");
            args.Append($"--out \"{outDirArg}\"");

            var psi = new ProcessStartInfo
            {
                FileName = _options.NodePath,
                Arguments = args.ToString(),
                WorkingDirectory = workingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            // Propagate audit run id to the runner so that logs can correlate back to the API.
            psi.Environment["KAMU_AUDIT_RUN_ID"] = run.Id.ToString("N");

            if (credential is not null)
            {
                if (!string.IsNullOrWhiteSpace(credential.Username))
                {
                    psi.Environment["KAMU_AUDIT_USERNAME"] = credential.Username;
                }

                if (!string.IsNullOrWhiteSpace(credential.Password))
                {
                    psi.Environment["KAMU_AUDIT_PASSWORD"] = credential.Password;
                }

                if (!string.IsNullOrWhiteSpace(credential.TwoFactorNote))
                {
                    psi.Environment["KAMU_AUDIT_2FA_NOTE"] = credential.TwoFactorNote;
                }
            }

            _logger.LogInformation("Running CLI: {FileName} {Arguments} (cwd={Cwd})", psi.FileName, psi.Arguments, psi.WorkingDirectory);

            using var process = new Process { StartInfo = psi };
            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
            var waitForExitTask = process.WaitForExitAsync(cancellationToken);

            var timeoutMinutes = _options.MaxRunDurationMinutes > 0 ? _options.MaxRunDurationMinutes : 15;
            var timeout = TimeSpan.FromMinutes(timeoutMinutes);

            var aggregateTask = Task.WhenAll(stdoutTask, stderrTask, waitForExitTask);
            var completed = await Task.WhenAny(aggregateTask, Task.Delay(timeout, cancellationToken));

            var stdout = string.Empty;
            var stderr = string.Empty;

            if (completed == aggregateTask)
            {
                // Process exited within timeout.
                stdout = stdoutTask.Result;
                stderr = stderrTask.Result;
            }
            else
            {
                // Timeout: attempt to kill process and capture whatever output we can.
                var timeoutMessage = $"Runner timeout after {timeoutMinutes} minutes.";
                run.LastError = timeoutMessage;
                run.ErrorType = "RunnerTimeout";
                run.LastExitCode = null;
                AuditMetrics.IncrementRunnerTimeouts();

                try
                {
                    if (!process.HasExited)
                    {
                        try
                        {
                            process.Kill(entireProcessTree: true);
                        }
                        catch (PlatformNotSupportedException)
                        {
                            process.Kill();
                        }
                    }
                }
                catch (Exception killEx)
                {
                    _logger.LogWarning(killEx, "Failed to kill hung runner process for audit run {AuditRunId}.", run.Id);
                }

                _logger.LogError("Runner timeout after {Minutes} minutes for audit run {AuditRunId}.", timeoutMinutes, run.Id);

                try
                {
                    await aggregateTask; // allow stdout/stderr reads to finish after kill
                    stdout = stdoutTask.Result;
                    stderr = stderrTask.Result;
                }
                catch (Exception ex) when (ex is OperationCanceledException or TaskCanceledException)
                {
                    // Background service is stopping; we still treat this as a failed run.
                }

                if (!string.IsNullOrWhiteSpace(stdout))
                    _logger.LogInformation("Runner stdout (timeout, run {RunId}): {Stdout}", run.Id, stdout);
                if (!string.IsNullOrWhiteSpace(stderr))
                    _logger.LogWarning("Runner stderr (timeout, run {RunId}): {Stderr}", run.Id, stderr);

                return false;
            }

            var exitCode = process.ExitCode;
            run.LastExitCode = exitCode;
            if (!string.IsNullOrWhiteSpace(stdout))
                _logger.LogInformation("Runner stdout (run {RunId}): {Stdout}", run.Id, stdout);
            if (!string.IsNullOrWhiteSpace(stderr))
                _logger.LogWarning("Runner stderr (run {RunId}): {Stderr}", run.Id, stderr);

            var success = exitCode == 0 || exitCode == 2;
            if (!success && string.IsNullOrWhiteSpace(run.LastError))
            {
                run.LastError = $"Runner exited with non-success exit code {exitCode}.";
            }

            if (!success && string.IsNullOrWhiteSpace(run.ErrorType))
            {
                run.ErrorType = "Unknown";
            }
            if (success)
            {
                run.ErrorType = null;
            }

            return success;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CLI execution failed for audit run {AuditRunId}.", run.Id);
            if (string.IsNullOrWhiteSpace(run.LastError))
            {
                run.LastError = "Runner threw an exception. See logs for details.";
            }
            if (string.IsNullOrWhiteSpace(run.ErrorType))
            {
                run.ErrorType = "Unknown";
            }
            run.LastExitCode = null;
            return false;
        }
    }
}

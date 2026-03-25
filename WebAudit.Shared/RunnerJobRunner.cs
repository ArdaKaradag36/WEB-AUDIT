using System.Diagnostics;

namespace WebAudit.Shared;

/// <summary>Runs <c>node dist/cli.js</c> for a single audit job (used by audit-host and queue worker).</summary>
public static class RunnerJobRunner
{
    public static async Task<(int ExitCode, string Stdout, string Stderr)> RunAsync(
        string runnerDir,
        string targetUrl,
        string runDirRel,
        int maxLinks,
        int maxUiAttempts,
        string loginMode,
        string? identifier,
        string? password,
        CancellationToken cancellationToken = default)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "node",
            WorkingDirectory = runnerDir,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
        };
        psi.ArgumentList.Add("dist/cli.js");
        psi.ArgumentList.Add("--url");
        psi.ArgumentList.Add(targetUrl);
        psi.ArgumentList.Add("--max-links");
        psi.ArgumentList.Add(maxLinks.ToString());
        psi.ArgumentList.Add("--max-ui-attempts");
        psi.ArgumentList.Add(maxUiAttempts.ToString());
        psi.ArgumentList.Add("--out");
        psi.ArgumentList.Add(runDirRel);

        if (loginMode != "none")
        {
            var id = identifier ?? "";
            var pass = password ?? "";
            psi.Environment["AUDIT_PASS"] = pass;
            psi.Environment["AUDIT_PASSWORD"] = pass;
            psi.Environment["AUDIT_USER"] = id;
            switch (loginMode)
            {
                case "email":
                    psi.Environment["AUDIT_EMAIL"] = id;
                    break;
                case "username":
                    psi.Environment["AUDIT_USERNAME"] = id;
                    break;
                case "phone":
                    psi.Environment["AUDIT_PHONE"] = id;
                    break;
            }
        }

        using var process = new Process { StartInfo = psi };
        process.Start();
        var stdoutTask = process.StandardOutput.ReadToEndAsync(CancellationToken.None);
        var stderrTask = process.StandardError.ReadToEndAsync(CancellationToken.None);
        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch { /* best-effort */ }
            try { await process.WaitForExitAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(3)); } catch { /* ignore */ }
            throw;
        }
        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        return (process.ExitCode, stdout, stderr);
    }
}

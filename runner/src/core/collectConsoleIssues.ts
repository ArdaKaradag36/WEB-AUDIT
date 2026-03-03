import type { Page } from "playwright";

export type ConsoleIssue = {
  type: string;
  text: string;
  location?: string;
};

export type ConsoleCollector = {
  issues: ConsoleIssue[];
  pageErrors: string[];
};

export async function collectConsoleIssues(page: Page): Promise<ConsoleCollector> {
  const issues: ConsoleIssue[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === "error" || type === "warning") {
      const loc = msg.location();
      issues.push({
        type,
        text,
        location: loc?.url ? `${loc.url}:${loc.lineNumber ?? ""}` : undefined,
      });
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message ?? String(err));
  });

  return { issues, pageErrors };
}

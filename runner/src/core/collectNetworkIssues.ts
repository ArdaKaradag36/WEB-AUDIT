import type { Page, Response, Request } from "@playwright/test";

export type NetworkIssue = {
  url: string;
  method?: string;
  status?: number;
  kind: "FAILED_REQUEST" | "HTTP_4XX_5XX";
  failureText?: string;
};

export async function collectNetworkIssues(page: Page) {
  const issues: NetworkIssue[] = [];

  page.on("requestfailed", (req: Request) => {
    issues.push({
      url: req.url(),
      method: req.method(),
      kind: "FAILED_REQUEST",
      failureText: req.failure()?.errorText,
    });
  });

  page.on("response", (res: Response) => {
    const status = res.status();
    if (status >= 400) {
      issues.push({
        url: res.url(),
        status,
        kind: "HTTP_4XX_5XX",
      });
    }
  });

  return issues;
}

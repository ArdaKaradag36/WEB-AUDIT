import { test, expect } from "@playwright/test";
import {
  dedupeNetworkIssuesByUrl,
  isLikelyAbortedMediaRequest,
  isMinorStaticAsset404,
  partitionHttpIssues,
} from "../core/networkClassify";
import type { NetworkIssue } from "../core/collectNetworkIssues";

test("medya ERR_ABORTED gürültüsü", () => {
  expect(
    isLikelyAbortedMediaRequest("https://videos.ctfassets.net/x/y/z.mp4", "net::ERR_ABORTED")
  ).toBe(true);
  expect(isLikelyAbortedMediaRequest("https://api.example.com/data", "net::ERR_ABORTED")).toBe(false);
});

test("küçük varlık 404", () => {
  expect(isMinorStaticAsset404("https://github.com/images/spinners/octocat-spinner-128.gif", 404)).toBe(true);
  expect(isMinorStaticAsset404("https://api.example.com/users", 404)).toBe(false);
});

test("dedupe aynı URL FAILED_REQUEST", () => {
  const issues: NetworkIssue[] = [
    { url: "https://x/a.mp4", kind: "FAILED_REQUEST", failureText: "net::ERR_ABORTED" },
    { url: "https://x/a.mp4", kind: "FAILED_REQUEST", failureText: "net::ERR_ABORTED" },
  ];
  expect(dedupeNetworkIssuesByUrl(issues)).toHaveLength(1);
});

test("partitionHttpIssues", () => {
  const issues: NetworkIssue[] = [
    { url: "https://x/a.gif", kind: "HTTP_4XX_5XX", status: 404 },
    { url: "https://x/api", kind: "HTTP_4XX_5XX", status: 404 },
  ];
  const { material4xx, minor404 } = partitionHttpIssues(issues);
  expect(minor404).toHaveLength(1);
  expect(material4xx).toHaveLength(1);
});

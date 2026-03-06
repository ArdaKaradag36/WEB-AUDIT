import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { runJsAnalyzer } from "../rules/js/analyzer";

test("detects potential secret-like patterns in HTML", () => {
  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "js",
    "secret-inline.html",
  );
  const html = fs.readFileSync(fixturePath, "utf-8");

  const findings = runJsAnalyzer({
    targetUrl: "https://example.com",
    consoleIssues: [],
    responseUrls: [],
    mainDocumentHtml: html,
  });

  const secretFinding = findings.find((f) => f.ruleId === "KWA-JS-001");
  expect(secretFinding).toBeTruthy();
  expect(secretFinding?.confidence).toBeLessThanOrEqual(0.6);
});

test("API endpoints and sourcemaps are inventoried", () => {
  const urls = [
    "https://example.com/api/users",
    "https://example.com/static/app.js",
    "https://example.com/static/app.js.map",
    "https://example.com/graphql",
  ];

  const findings = runJsAnalyzer({
    targetUrl: "https://example.com",
    consoleIssues: [],
    responseUrls: urls,
  });

  const apiFinding = findings.find((f) => f.ruleId === "KWA-JS-002");
  const mapFinding = findings.find((f) => f.ruleId === "KWA-JS-003");
  expect(apiFinding).toBeTruthy();
  expect(mapFinding).toBeTruthy();
});

test("console debug noise is reported", () => {
  const findings = runJsAnalyzer({
    targetUrl: "https://example.com",
    consoleIssues: [
      { type: "log", text: "DEBUG: dev mode enabled", location: undefined },
      { type: "log", text: "development build", location: undefined },
    ],
    responseUrls: [],
  });

  const debugFinding = findings.find((f) => f.ruleId === "KWA-JS-004");
  expect(debugFinding).toBeTruthy();
});


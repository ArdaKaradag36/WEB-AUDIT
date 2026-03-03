import type { Page, BrowserContext } from "playwright";
import type { Artifact, TestResult } from "../domain/result";

export type Capability = "AUTH" | "COOKIE_CONSENT";

export type PluginContext = {
  runId: string;
  targetUrl: string;
  outDir: string;
  page: Page;
  context: BrowserContext;
  results: TestResult[];
  artifacts: Artifact[];
};

export type Plugin = {
  name: string;
  providesCapabilities: Capability[];
  apply(ctx: PluginContext): Promise<void>;
};

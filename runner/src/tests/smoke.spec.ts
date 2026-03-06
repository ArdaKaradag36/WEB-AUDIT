import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { test, expect } from "@playwright/test";
import { startSimpleSite } from "./mocks/sites/simpleSite";

test("smoke: CLI run crawls multiple pages and writes summary with artifact manifest", async () => {
  const { server, baseUrl } = await startSimpleSite();

  const tmpRoot = fs.mkdtempSync(path.join(process.cwd(), "cli-smoke-"));
  const outDir = path.join(tmpRoot, "run");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("node", ["dist/cli.js", "--url", baseUrl, "--out", outDir, "--headless", "true"], {
        cwd: path.join(process.cwd()),
        env: { ...process.env },
        stdio: "inherit",
      });

      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0 || code === 2) resolve();
        else reject(new Error(`CLI exited with code ${code}`));
      });
    });

    const summaryPath = path.join(outDir, "summary.json");
    expect(fs.existsSync(summaryPath)).toBeTruthy();
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));

    // Expect pagesScanned >= 2 because crawler should visit / and /a at least.
    expect(summary.metrics.pagesScanned).toBeGreaterThanOrEqual(2);

    // Artifact manifest should exist and referenced files should be present.
    expect(Array.isArray(summary.artifacts)).toBeTruthy();
    expect(summary.artifacts.length).toBeGreaterThan(0);

    for (const art of summary.artifacts) {
      expect(typeof art.type).toBe("string");
      expect(typeof art.path).toBe("string");
      const fullPath = path.join(outDir, art.path);
      expect(fs.existsSync(fullPath)).toBeTruthy();
      if (art.sizeBytes !== undefined) {
        expect(typeof art.sizeBytes).toBe("number");
      }
      if (art.sha256 !== undefined) {
        expect(typeof art.sha256).toBe("string");
      }
    }
  } finally {
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("secrets are not leaked into JSON artifacts", async () => {
  const { server, baseUrl } = await startSimpleSite();

  const tmpRoot = fs.mkdtempSync(path.join(process.cwd(), "cli-smoke-secret-"));
  const outDir = path.join(tmpRoot, "run");
  const fakeSecret = "FAKE_SUPER_SECRET_PASSWORD_123!";

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "node",
        ["dist/cli.js", "--url", baseUrl, "--out", outDir, "--headless", "true"],
        {
          cwd: path.join(process.cwd()),
          env: { ...process.env, KAMU_AUDIT_PASSWORD: fakeSecret },
          stdio: "inherit",
        },
      );

      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0 || code === 2) resolve();
        else reject(new Error(`CLI exited with code ${code}`));
      });
    });

    // Recursively scan all JSON files under outDir and ensure the fake secret never appears.
    function* walk(dir: string): Generator<string> {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          yield* walk(full);
        } else if (entry.toLowerCase().endsWith(".json")) {
          yield full;
        }
      }
    }

    for (const jsonPath of walk(outDir)) {
      const content = fs.readFileSync(jsonPath, "utf-8");
      expect(content.includes(fakeSecret)).toBeFalsy();
    }
  } finally {
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

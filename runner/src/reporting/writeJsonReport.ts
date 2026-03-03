import fs from "fs";
import path from "path";
import { AuditReport } from "../domain/result";

export function writeJsonReport(outDir: string, report: AuditReport) {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, "report.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}

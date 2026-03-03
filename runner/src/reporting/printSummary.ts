import { AuditReport } from "../domain/result";

export function printSummary(report: AuditReport) {
  const s = report.summary;

  console.log("==== AUDIT SUMMARY ====");
  console.log("Target:", report.targetUrl);
  console.log(
    `Total: ${s.total} | PASS: ${s.pass} | FAIL: ${s.fail} | BLOCKED: ${s.blocked} | NA: ${s.na} | SKIPPED: ${s.skipped}`
  );

  const failed = report.results.filter((r) => r.status === "FAIL");
  const blocked = report.results.filter((r) => r.status === "BLOCKED");
  const skipped = report.results.filter((r) => r.status === "SKIPPED");

  if (failed.length) {
    console.log("\n-- FAIL --");
    for (const r of failed) console.log(`✗ ${r.code} - ${r.title} :: ${r.errorMessage ?? ""}`);
  }

  if (blocked.length) {
    console.log("\n-- BLOCKED --");
    for (const r of blocked) console.log(`! ${r.code} - ${r.title} :: ${r.errorMessage ?? ""}`);
  }

  // Kamu için iyi: SKIPPED görünür olsun
  if (skipped.length) {
    console.log("\n-- SKIPPED --");
    for (const r of skipped) console.log(`~ ${r.code} - ${r.title} :: ${r.errorMessage ?? ""}`);
  }
}

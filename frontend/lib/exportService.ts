import { apiBaseUrl, authorizedFetch } from "./api";
import { captureUnexpectedError, showToast } from "../utils/errorHandler";

export interface AuditExportContext {
  auditId: string;
  detail?: any;
  findings?: any[];
  gaps?: any[];
}

function formatDateForFile(date: string | undefined | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}`;
}

function downloadBlob(data: BlobPart, filename: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchDetailBundle(auditId: string): Promise<Required<AuditExportContext>> {
  const [detailRes, findingsRes, gapsRes] = await Promise.all([
    authorizedFetch(`${apiBaseUrl}/api/Audits/${auditId}`),
    authorizedFetch(
      `${apiBaseUrl}/api/Audits/${auditId}/findings?page=1&pageSize=500`
    ),
    authorizedFetch(`${apiBaseUrl}/api/Audits/${auditId}/gaps?page=1&pageSize=500`)
  ]);

  if (!detailRes.ok) {
    throw new Error("Denetim bulunamadı.");
  }

  const detail = await detailRes.json();
  const findingsJson = findingsRes.ok ? await findingsRes.json() : { items: [] };
  const gapsJson = gapsRes.ok ? await gapsRes.json() : { items: [] };

  return {
    auditId,
    detail,
    findings: findingsJson.items ?? [],
    gaps: gapsJson.items ?? []
  };
}

async function ensureContext(ctx: AuditExportContext): Promise<Required<AuditExportContext>> {
  if (ctx.detail && ctx.findings && ctx.gaps) {
    return ctx as Required<AuditExportContext>;
  }
  return fetchDetailBundle(ctx.auditId);
}

export async function exportAuditJson(ctx: AuditExportContext) {
  try {
    const full = await ensureContext(ctx);
    const nowSuffix = formatDateForFile(full.detail?.startedAt ?? new Date().toISOString());
    const filename = `kamu-web-audit_${full.auditId}_${nowSuffix}.json`;
    const payload = {
      audit: full.detail,
      findings: full.findings,
      gaps: full.gaps
    };
    const json = JSON.stringify(payload, null, 2);
    downloadBlob(json, filename, "application/json;charset=utf-8");
    showToast("JSON raporu indiriliyor.", "success");
  } catch (err: any) {
    captureUnexpectedError(err, { scope: "exportAuditJson" });
    showToast(err?.message ?? "JSON raporu indirilemedi.");
  }
}

function mapSeverityToTurkish(sev: string | undefined): string {
  if (!sev) return "";
  const value = sev.toLowerCase();
  switch (value) {
    case "critical":
    case "kritik":
      return "Kritik";
    case "high":
    case "yüksek":
      return "Yüksek";
    case "medium":
    case "orta":
      return "Orta";
    case "low":
    case "düşük":
      return "Düşük";
    case "info":
    case "bilgi":
      return "Bilgi";
    default:
      return sev;
  }
}

function mapCategoryToTurkish(category: string | undefined): string {
  if (!category) return "";
  const value = category.toLowerCase();
  if (value === "accessibility") return "Erişilebilirlik";
  if (value === "security") return "Güvenlik";
  if (value === "performance") return "Performans";
  if (value === "network") return "Ağ";
  if (value === "seo") return "SEO";
  return category;
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(";") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportFindingsCsv(ctx: AuditExportContext) {
  try {
    const full = await ensureContext(ctx);

    const audit = full.detail ?? {};
    const hedefUrl = audit.targetUrl ?? "";
    const durum = audit.status ?? "";
    const baslangic = audit.startedAt ?? "";
    const bitis = audit.finishedAt ?? "";

    const header = [
      "DenetimId",
      "HedefUrl",
      "Durum",
      "Baslangic",
      "Bitis",
      "KuralId",
      "Kategori",
      "Seviye",
      "Baslik",
      "Aciklama",
      "Etki",
      "OnerilenDuzeltme",
      "Kanit",
      "Konum",
      "TeknikDetay",
      "OlusturmaZamani"
    ];

    const lines: string[] = [];
    lines.push(header.join(";"));

    const findings = full.findings ?? [];

    for (const raw of findings) {
      const f: any = raw ?? {};
      const ruleId = f.ruleId ?? "";
      const kategori = mapCategoryToTurkish(f.category);
      const seviye = mapSeverityToTurkish(f.severity);
      const baslik = f.title ?? "";

      const aciklama =
        f.description ??
        f.message ??
        f.summary ??
        "Eklenti tarafından üretilen bulgu. Detaylar teknik alanda yer alır.";

      const etki =
        f.impact ??
        "Bu bulgu çözülmediği takdirde kullanıcı deneyimi, güvenlik veya performans üzerinde olumsuz etkiler oluşturabilir.";

      let onerilen =
        f.remediation ??
        f.recommendation ??
        f.suggestion ??
        "1) İlgili sayfayı veya bileşeni incele.\n2) Eklenti tarafından belirtilen önerileri değerlendir.\n3) Gerekirse manuel test ve kod iyileştirmesi yap.";

      if (!/^\d\)/.test(onerilen.trim())) {
        const steps = onerilen
          .split(/[.\n]/)
          .map(s => s.trim())
          .filter(Boolean);
        if (steps.length > 0) {
          onerilen = steps.map((s, idx) => `${idx + 1}) ${s}`).join(" ");
        }
      }

      let kanit = "";
      if (Array.isArray(f.evidence)) {
        kanit = f.evidence
          .map((e: any) => e?.description || e?.path || e?.url || e?.selector || "")
          .filter(Boolean)
          .join(" | ");
      } else if (f.evidence) {
        kanit =
          f.evidence.description ||
          f.evidence.path ||
          f.evidence.url ||
          f.evidence.selector ||
          "";
      }

      const pageUrl = f.pageUrl || f.url || hedefUrl;
      const selector = f.selector || f.element || f.node;
      const konum = selector ? `${pageUrl ?? ""} ${selector}`.trim() : pageUrl ?? "";

      let teknikDetay = "";
      try {
        const clone: any = { ...f };
        delete clone.evidence;
        delete clone.remediation;
        delete clone.recommendation;
        delete clone.suggestion;
        teknikDetay = JSON.stringify(clone);
      } catch (error) {
        captureUnexpectedError(error, { scope: "exportFindingsCsv.serializeFinding" });
        teknikDetay = "";
      }

      const olusturmaZamani = f.createdAt ?? "";

      const row = [
        full.auditId ?? "",
        hedefUrl,
        durum,
        baslangic,
        bitis,
        ruleId,
        kategori,
        seviye,
        baslik,
        aciklama,
        etki,
        onerilen,
        kanit,
        konum,
        teknikDetay,
        olusturmaZamani
      ].map(v => escapeCsv(String(v ?? "")));

      lines.push(row.join(";"));
    }

    const csvContent = "\uFEFF" + lines.join("\n");
    const filename = `kamu-web-audit_${full.auditId}_bulgular.csv`;
    downloadBlob(csvContent, filename, "text/csv;charset=utf-8");
    showToast("CSV dışa aktarıldı.", "success");
  } catch (err: any) {
    captureUnexpectedError(err, { scope: "exportFindingsCsv" });
    showToast(err?.message ?? "CSV dışa aktarılamadı.");
  }
}

export async function exportGapsCsv(ctx: AuditExportContext) {
  try {
    const auditId = ctx.auditId;
    const res = await authorizedFetch(
      `${apiBaseUrl}/api/Audits/${auditId}/gaps.csv`
    );
    if (!res.ok) {
      throw new Error("Gap CSV indirilemedi (sunucu hatası).");
    }
    const text = await res.text();
    const filename = `kamu-web-audit_${auditId}_gaps.csv`;
    // Server already returns normalized gaps CSV; just stream it down.
    downloadBlob("\uFEFF" + text, filename, "text/csv;charset=utf-8");
    showToast("Gap CSV dışa aktarıldı.", "success");
  } catch (err: any) {
    captureUnexpectedError(err, { scope: "exportGapsCsv" });
    showToast(err?.message ?? "Gap CSV dışa aktarılamadı.");
  }
}

export async function exportAuditTrace(ctx: AuditExportContext) {
  try {
    const full = await ensureContext(ctx);

    const traceUrl =
      full.detail?.traceUrl ||
      full.detail?.tracePath ||
      full.detail?.traceZipPath ||
      null;

    if (!traceUrl) {
      window.alert("Bu denetim için trace bulunamadı.");
      return;
    }

    const absoluteUrl = traceUrl.startsWith("http")
      ? traceUrl
      : `${apiBaseUrl.replace(/\/$/, "")}/${traceUrl.replace(/^\//, "")}`;

    const res = await authorizedFetch(absoluteUrl);
    if (!res.ok) {
      showToast("Bu denetim için trace bulunamadı.");
      return;
    }
    const blob = await res.blob();
    const filename = `kamu-web-audit_${full.auditId}_trace.zip`;
    downloadBlob(blob, filename, "application/zip");
    showToast("Trace indiriliyor…", "success");
  } catch (err: any) {
    captureUnexpectedError(err, { scope: "exportAuditTrace" });
    showToast(err?.message ?? "Trace indirilemedi.");
  }
}

export async function exportAuditPdf(ctx: AuditExportContext) {
  try {
    const full = await ensureContext(ctx);

    let usedServerPdf = false;
    try {
      const res = await authorizedFetch(
        `${apiBaseUrl}/api/Audits/${full.auditId}/report-pdf`
      );
      if (res.ok) {
        const blob = await res.blob();
        const filename = `kamu-web-audit_${full.auditId}_rapor.pdf`;
        downloadBlob(blob, filename, "application/pdf");
        showToast("PDF raporu indiriliyor…", "success");
        usedServerPdf = true;
      }
    } catch (error) {
      captureUnexpectedError(error, { scope: "exportAuditPdf.serverPdf" });
      // fall back to text summary
    }

    if (usedServerPdf) return;

    const detail = full.detail ?? {};
    const findings = full.findings ?? [];

    const lines: string[] = [];
    lines.push("Kamu Web Audit Raporu");
    lines.push("");
    lines.push("Denetim Bilgisi");
    lines.push(`ID: ${detail.id ?? full.auditId}`);
    lines.push(`Hedef URL: ${detail.targetUrl ?? ""}`);
    lines.push(`Başlangıç: ${detail.startedAt ?? ""}`);
    lines.push(`Bitiş: ${detail.finishedAt ?? ""}`);
    lines.push("");

    const totalFindings = findings.length;
    const sevCounts: Record<string, number> = {};
    for (const raw of findings) {
      const sev = mapSeverityToTurkish((raw as any).severity);
      if (!sev) continue;
      sevCounts[sev] = (sevCounts[sev] ?? 0) + 1;
    }
    lines.push("Özet Metrikler");
    lines.push(`Toplam Bulgu: ${totalFindings}`);
    const sevSummary = Object.entries(sevCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    if (sevSummary) {
      lines.push(`Dağılım: ${sevSummary}`);
    }
    lines.push("");

    lines.push("Bulgular Özeti");
    for (const raw of findings.slice(0, 20)) {
      const f: any = raw ?? {};
      lines.push("----------------------------------------");
      lines.push(`Kural: ${f.ruleId ?? ""}`);
      lines.push(`Seviye: ${mapSeverityToTurkish(f.severity)}`);
      lines.push(`Kategori: ${mapCategoryToTurkish(f.category)}`);
      lines.push(`Başlık: ${f.title ?? ""}`);
      const aciklama =
        f.description ??
        f.message ??
        f.summary ??
        "Detay için JSON raporuna bakınız.";
      lines.push(`Açıklama: ${aciklama}`);
      const pageUrl = f.pageUrl || f.url || detail.targetUrl || "";
      const selector = f.selector || f.element || f.node || "";
      if (pageUrl || selector) {
        lines.push(`Konum: ${pageUrl} ${selector}`.trim());
      }
      lines.push("");
    }

    lines.push("Not: Detaylar için JSON raporu inceleyiniz.");

    const textContent = lines.join("\n");
    const filename = `kamu-web-audit_${full.auditId}_rapor.txt`;
    downloadBlob(textContent, filename, "text/plain;charset=utf-8");
    showToast(
      "PDF yerine özet rapor metni indirildi (sunucu PDF ucu bulunamadı).",
      "success"
    );
  } catch (err: any) {
    captureUnexpectedError(err, { scope: "exportAuditPdf" });
    showToast(err?.message ?? "PDF raporu indirilemedi.");
  }
}


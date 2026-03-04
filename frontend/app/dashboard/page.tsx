"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { apiBaseUrl, apiRequest } from "../../lib/api";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { AuditListTable, AuditSummaryRow } from "../../components/AuditListTable";
import { logError } from "../../utils/errorHandler";

interface AuditSummary {
  auditRunId: string;
  findingsTotal: number;
  gapsTotal: number;
  criticalCount: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  gapsByRiskSafe: number;
  gapsByRiskNeedsAllowlist: number;
  gapsByRiskDestructive: number;
  gapsByRiskRequiresAuth: number;
  durationMs?: number;
  linkSampled?: number;
  linkBroken?: number;
   totalElements?: number;
   testedElements?: number;
   skippedElements?: number;
   coverageRatio?: number;
}

function DashboardPageInner() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditSummaryRow[]>([]);
  const [latestSummary, setLatestSummary] = useState<AuditSummary | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest<AuditSummaryRow[]>(`${apiBaseUrl}/api/Audits`);
        setAudits(data);

        const latestCompleted = data.find(a => a.status === "completed");
        if (latestCompleted) {
          try {
            const summary = await apiRequest<AuditSummary>(
              `${apiBaseUrl}/api/Audits/${latestCompleted.id}/summary`
            );
            setLatestSummary(summary);
          } catch (err) {
            logError(err, { scope: "Dashboard.loadLatestSummary" });
          }
        } else {
          setLatestSummary(null);
        }
      } catch (error) {
        // apiRequest already logged + toasted; just add scoped log entry.
        logError(error, { scope: "Dashboard.loadAudits" });
      }
    })();
  }, [router]);

  const total = audits.length;
  const completed = audits.filter(a => a.status === "completed").length;
  const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";
  const successRateNumber = total > 0 ? (completed / total) * 100 : 0;
  const successRingStyle = { "--progress": `${successRateNumber}%` } as CSSProperties;
  const coverageRatio =
    latestSummary && latestSummary.totalElements && latestSummary.totalElements > 0
      ? (latestSummary.testedElements ?? 0) / latestSummary.totalElements
      : 0;
  const coveragePercent = Math.round(coverageRatio * 1000) / 10; // 1 decimal
  const uiCoverageRingStyle = { "--progress": `${coveragePercent}%` } as CSSProperties;
  const activeFindings =
    latestSummary ? latestSummary.criticalCount + latestSummary.errorCount : null;

  return (
    <div className="dashboard-page">
      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-ring metric-ring-primary" aria-hidden="true">
            <div className="metric-ring-inner">
              <span className="metric-ring-value">{total}</span>
            </div>
          </div>
          <p className="metric-label">Toplam Denetim Çalıştırma</p>
          <p className="metric-caption">Son 30 gün (tüm hedefler)</p>
        </div>
        <div className="metric-card">
          <div
            className="metric-ring metric-ring-success"
            aria-label={`Başarı oranı ${successRate}%`}
            role="img"
            style={successRingStyle}
          >
            <div className="metric-ring-inner">
              <span className="metric-ring-value">{successRate}%</span>
            </div>
          </div>
          <p className="metric-label">Başarı Oranı</p>
          <p className="metric-caption">Tamamlanan / Tüm denetimler</p>
        </div>
        <div className="metric-card">
          <div className="metric-ring metric-ring-warn" aria-hidden="true">
            <div className="metric-ring-inner">
              <span className="metric-ring-value">
                {activeFindings !== null ? activeFindings : "–"}
              </span>
            </div>
          </div>
          <p className="metric-label">Aktif Bulgular</p>
          <p className="metric-caption">
            Son tamamlanan denetimde kritik + hata bulgular
          </p>
        </div>
        <div className="metric-card">
          <div
            className="metric-ring metric-ring-info"
            aria-label={
              latestSummary && latestSummary.totalElements
                ? `UI test kapsamı ${coveragePercent.toFixed(1)}%`
                : "UI test kapsamı"
            }
            role="img"
            style={uiCoverageRingStyle}
          >
            <div className="metric-ring-inner">
              <span className="metric-ring-value">
                {latestSummary && latestSummary.totalElements
                  ? `${coveragePercent.toFixed(1)}%`
                  : "–"}
              </span>
            </div>
          </div>
          <p className="metric-label">UI Test Kapsamı</p>
          <p className="metric-caption">
            {latestSummary && latestSummary.totalElements
              ? `${latestSummary.testedElements ?? 0} / ${latestSummary.totalElements} öğe test edildi`
              : "Henüz kapsam hesaplanamadı"}
          </p>
          {latestSummary && latestSummary.totalElements ? (
            <div className="coverage-bar" aria-hidden="true">
              {(() => {
                const total = latestSummary.totalElements ?? 0;
                const tested = latestSummary.testedElements ?? 0;
                const skipped = latestSummary.skippedElements ?? 0;
                const unknown = Math.max(total - tested - skipped, 0);
                const toPercent = (value: number) =>
                  total > 0 ? `${(value / total) * 100}%` : "0%";
                return (
                  <>
                    <div
                      className="coverage-bar-segment coverage-bar-tested"
                      style={{ width: toPercent(tested) }}
                    />
                    <div
                      className="coverage-bar-segment coverage-bar-skipped"
                      style={{ width: toPercent(skipped) }}
                    />
                    <div
                      className="coverage-bar-segment coverage-bar-unknown"
                      style={{ width: toPercent(unknown) }}
                    />
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      </section>

      <div className="dashboard-main-grid">
        <section className="card audit-list-card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header card-header-row">
            <div>
              <h2>Son 5 Denetim</h2>
              <p>En son oluşturduğun 5 denetimden kısa bir özet.</p>
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => router.push("/reports")}
            >
              Tümünü Gör
            </button>
          </div>
          <AuditListTable
            audits={audits.slice(0, 5)}
            onSelect={id => router.push(`/audits/${id}`)}
            showActions={false}
          />
        </section>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardPageInner />
    </ProtectedRoute>
  );
}


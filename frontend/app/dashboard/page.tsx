"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { apiBaseUrl, apiRequest } from "../../lib/api";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { AuditListTable } from "../../components/AuditListTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { logError } from "../../utils/errorHandler";
import type { AuditSummaryRow, AuditSummary } from "../../lib/types/audits";
import { computeDashboardMetrics } from "../../lib/mappers/audits";

function DashboardPageInner() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditSummaryRow[]>([]);
  const [latestSummary, setLatestSummary] = useState<AuditSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const data = await apiRequest<AuditSummaryRow[]>(`${apiBaseUrl}/api/Audits`);
        setAudits(data);

        const latestCompleted = data.find((a) => a.status === "completed");
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
      } catch (error: any) {
        logError(error, { scope: "Dashboard.loadAudits" });
        setLoadError(error?.message ?? "Dashboard verileri yüklenemedi.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const metrics = computeDashboardMetrics(audits, latestSummary);
  const successRingStyle = { "--progress": `${metrics.successRate}%` } as CSSProperties;
  const uiCoverageRingStyle = {
    "--progress": `${metrics.uiCoveragePercent}%`,
  } as CSSProperties;

  return (
    <div className="dashboard-page">
      <section className="page-section-intro">
        <div>
          <span className="section-eyebrow">Operasyon Özeti</span>
          <h2 className="page-section-title">Denetim Gösterge Paneli</h2>
          <p className="page-section-description">
            Son denetim hareketlerini, başarı oranını ve UI kapsama görünümünü tek ekranda takip et.
          </p>
        </div>
      </section>

      <section className="metrics-grid">
        {isLoading && audits.length === 0 ? (
          <div className="metric-card metric-card-full">
            <LoadingState variant="card" message="Dashboard verileri yükleniyor..." />
          </div>
        ) : loadError ? (
          <div className="metric-card metric-card-full">
            <ErrorState title="Dashboard yüklenemedi" description={loadError} />
          </div>
        ) : (
          <>
            <div className="metric-card metric-card-updated">
              <div className="metric-card-top">
                <span className="metric-chip">Genel</span>
              </div>
              <div className="metric-ring metric-ring-primary" aria-hidden="true">
                <div className="metric-ring-inner">
                  <span className="metric-ring-value">{metrics.totalAudits}</span>
                </div>
              </div>
              <p className="metric-label">Toplam Denetim Çalıştırma</p>
              <p className="metric-caption">Son 30 gün içindeki tüm hedefler</p>
            </div>

            <div className="metric-card metric-card-updated">
              <div className="metric-card-top">
                <span className="metric-chip metric-chip-success">Stabilite</span>
              </div>
              <div
                className="metric-ring metric-ring-success"
                aria-label={`Başarı oranı ${metrics.successRate.toFixed(1)}%`}
                role="img"
                style={successRingStyle}
              >
                <div className="metric-ring-inner">
                  <span className="metric-ring-value">{metrics.successRate.toFixed(1)}%</span>
                </div>
              </div>
              <p className="metric-label">Başarı Oranı</p>
              <p className="metric-caption">Tamamlanan denetimlerin toplam içindeki oranı</p>
            </div>

            <div className="metric-card metric-card-updated">
              <div className="metric-card-top">
                <span className="metric-chip metric-chip-danger">Risk</span>
              </div>
              <div className="metric-ring metric-ring-warn" aria-hidden="true">
                <div className="metric-ring-inner">
                  <span className="metric-ring-value">
                    {metrics.activeFindings !== null ? metrics.activeFindings : "–"}
                  </span>
                </div>
              </div>
              <p className="metric-label">Aktif Bulgular</p>
              <p className="metric-caption">Son tamamlanan denetimde kritik + hata bulguları</p>
            </div>

            <div className="metric-card metric-card-updated">
              <div className="metric-card-top">
                <span className="metric-chip metric-chip-info">Coverage</span>
              </div>
              <div
                className="metric-ring metric-ring-info"
                aria-label={
                  latestSummary && latestSummary.totalElements
                    ? `UI test kapsamı ${metrics.uiCoveragePercent.toFixed(1)}%`
                    : "UI test kapsamı"
                }
                role="img"
                style={uiCoverageRingStyle}
              >
                <div className="metric-ring-inner">
                  <span className="metric-ring-value">
                    {latestSummary && latestSummary.totalElements
                      ? `${metrics.uiCoveragePercent.toFixed(1)}%`
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

                    const toPercent = (value: number) => (total > 0 ? `${(value / total) * 100}%` : "0%");

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
          </>
        )}
      </section>

      <div className="dashboard-main-grid">
        <section className="card audit-list-card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header card-header-row">
            <div>
              <span className="section-eyebrow">Son Aktiviteler</span>
              <h2>Son 5 Denetim</h2>
              <p>Yeni başlayan veya tamamlanan en güncel denetimlerin kısa özeti.</p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => router.push("/reports")}
            >
              Tümünü Gör
            </button>
          </div>

          {isLoading && audits.length === 0 ? (
            <LoadingState variant="table" />
          ) : loadError ? (
            <div className="card-body">
              <ErrorState title="Denetim listesi yüklenemedi" description={loadError} />
            </div>
          ) : audits.length === 0 ? (
            <div className="card-body">
              <EmptyState
                title="Henüz denetim bulunmuyor"
                description="İlk denetimini başlatarak dashboard görünümünü doldurabilirsin."
                actionLabel="Yeni denetim başlat"
                onAction={() => router.push("/audits/new")}
              />
            </div>
          ) : (
            <AuditListTable
              audits={audits.slice(0, 5)}
              onSelect={(id) => router.push(`/audits/${id}`)}
              showActions={false}
            />
          )}
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
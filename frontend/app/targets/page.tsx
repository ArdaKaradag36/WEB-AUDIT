"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { apiBaseUrl, apiRequest, ApiError } from "../../lib/api";
import { logError } from "../../utils/errorHandler";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import type { AuditSummaryRow } from "../../components/AuditListTable";

type TargetRow = {
  targetUrl: string;
  lastStatus: string;
  lastScanId: string;
  lastScanAt?: string;
  scanCount: number;
};

function TargetsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [audits, setAudits] = useState<AuditSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ statusCode?: number; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<AuditSummaryRow[]>(`${apiBaseUrl}/api/Audits`);
        if (cancelled) return;
        setAudits(data);
      } catch (err: any) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          const message =
            err.status === 401
              ? "Oturumun geçersiz. Tekrar giriş yap."
              : err.status === 403
              ? "Bu kaynağa erişim iznin yok."
              : err.status === 429
              ? "Çok fazla istek. Biraz sonra tekrar dene."
              : err.status >= 500
              ? "Sunucu hatası. Tekrar dene."
              : err.message || "Hedef listesi yüklenirken bir hata oluştu.";
          setError({ statusCode: err.status, message });
        } else {
          setError({
            message: "Bağlantı sorunu.",
          });
        }
        logError(err, { scope: "Targets.loadAudits" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const targets: TargetRow[] = useMemo(() => {
    const byUrl = new Map<string, TargetRow>();
    for (const a of audits) {
      const url = a.targetUrl;
      const existing = byUrl.get(url);
      const date = a.startedAt ?? a.finishedAt;
      if (!existing) {
        byUrl.set(url, {
          targetUrl: url,
          lastStatus: a.status,
          lastScanId: a.id,
          lastScanAt: date,
          scanCount: 1,
        });
      } else {
        existing.scanCount += 1;
        // Daha yeni bir run ise lastScan güncelle
        if (
          date &&
          (!existing.lastScanAt ||
            new Date(date).getTime() > new Date(existing.lastScanAt).getTime())
        ) {
          existing.lastScanAt = date;
          existing.lastStatus = a.status;
          existing.lastScanId = a.id;
        }
      }
    }
    return Array.from(byUrl.values()).sort((a, b) =>
      (b.lastScanAt ?? "").localeCompare(a.lastScanAt ?? ""),
    );
  }, [audits]);

  function formatDateTime(value?: string): string {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("tr-TR");
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <LoadingState variant="page" message="Hedefler yükleniyor..." />
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <ErrorState
          statusCode={error.statusCode}
          title="Hedefler yüklenemedi"
          description={error.message}
          actions={[
            {
              label: "Tekrar dene",
              onClick: () => router.refresh(),
              variant: "primary",
            },
          ]}
        />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="targets-page">
        <section className="card">
          <div className="card-header card-header-row">
            <div>
              <h2>Hedefler</h2>
              <p>Tarama geçmişine göre otomatik türetilen hedef listesi.</p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => router.push("/audits/new")}
            >
              Yeni Denetim
            </button>
          </div>
          <div className="card-table-wrapper">
            <table className="card-table">
              <thead>
                <tr>
                  <th>Hedef URL</th>
                  <th>Son Durum</th>
                  <th>Son Denetim</th>
                  <th>Toplam Denetim</th>
                  <th>Aksiyonlar</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.targetUrl}>
                    <td className="cell-url" title={t.targetUrl}>
                      {t.targetUrl}
                    </td>
                    <td>{t.lastStatus}</td>
                    <td>{formatDateTime(t.lastScanAt)}</td>
                    <td>{t.scanCount}</td>
                    <td>
                      <div className="targets-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            router.push(`/audits/new?targetUrl=${encodeURIComponent(t.targetUrl)}`)
                          }
                        >
                          Bu hedefte yeni denetim
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => router.push(`/audits/${t.lastScanId}`)}
                        >
                          Son denetimi aç
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {targets.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="Henüz kayıtlı bir hedef yok"
                        description="Yeni bir denetim başlatarak bu listeyi doldurabilirsin."
                        actionLabel="Yeni denetim başlat"
                        onAction={() => router.push("/audits/new")}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ProtectedRoute>
  );
}

export default function TargetsPage() {
  return <TargetsPageInner />;
}


"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiBaseUrl, apiRequest, ApiError } from "../../../lib/api";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { AuditSidebar } from "../../../components/AuditSidebar";
import { StatusBadge } from "../../../components/StatusBadge";
import { AuditActionsMenu } from "../../../components/AuditActionsMenu";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import type {
  AuditDetail,
  AuditSummary,
  FindingDto,
  FindingGroupDto,
  GapDto,
  PagedFindingsResponse,
} from "../../../lib/types/audits";

type ErrorKind =
  | "unauthorized"
  | "forbidden"
  | "rateLimited"
  | "server"
  | "notFound"
  | "network"
  | "generic";

interface ErrorState {
  kind: ErrorKind;
  status?: number;
  message: string;
  detail?: string;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "cancelled"]);

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("tr-TR");
}

function mapApiError(err: ApiError): ErrorState {
  switch (err.status) {
    case 401:
      return {
        kind: "unauthorized",
        status: err.status,
        message: "Oturumunuzun süresi dolmuş olabilir. Lütfen tekrar giriş yapın.",
        detail: err.detail
      };
    case 403:
      return {
        kind: "forbidden",
        status: err.status,
        message: "Bu denetimi görüntüleme yetkiniz yok.",
        detail: err.detail
      };
    case 404:
      return {
        kind: "notFound",
        status: err.status,
        message: "İstenen denetim kaydı bulunamadı.",
        detail: err.detail
      };
    case 429:
      return {
        kind: "rateLimited",
        status: err.status,
        message: "Çok sık istek gönderildi. Lütfen birkaç saniye sonra tekrar deneyin.",
        detail: err.detail
      };
    default:
      if (err.status >= 500) {
        return {
          kind: "server",
          status: err.status,
          message: "Sunucu tarafında bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
          detail: err.detail
        };
      }
      return {
        kind: "generic",
        status: err.status,
        message: err.message || "Beklenmeyen bir hata oluştu.",
        detail: err.detail
      };
  }
}

function AuditDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [findings, setFindings] = useState<FindingDto[]>([]);
  const [findingGroups, setFindingGroups] = useState<FindingGroupDto[]>([]);
  const [gaps, setGaps] = useState<GapDto[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [retryToken, setRetryToken] = useState(0);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setRetryToken(token => token + 1);
  };

  useEffect(() => {
    if (!id) return;
    const abortController = new AbortController();

    async function loadInitial() {
      try {
        setError(null);
        const [detailResp, findingsPage, gapsPage, summaryResp] = await Promise.all([
          apiRequest<AuditDetail>(`${apiBaseUrl}/api/Audits/${id}`, {
            signal: abortController.signal
          }),
          apiRequest<PagedFindingsResponse>(
            `${apiBaseUrl}/api/Audits/${id}/findings?page=1&pageSize=200`,
            { signal: abortController.signal }
          ),
          apiRequest<{ items: GapDto[] }>(
            `${apiBaseUrl}/api/Audits/${id}/gaps?page=1&pageSize=20`,
            { signal: abortController.signal }
          ),
          apiRequest<AuditSummary>(`${apiBaseUrl}/api/Audits/${id}/summary`, {
            signal: abortController.signal
          })
        ]);

        setDetail(detailResp);
        setFindings((findingsPage.items ?? []) as FindingDto[]);
        setFindingGroups((findingsPage.groups ?? []) as FindingGroupDto[]);
        setGaps((gapsPage.items ?? []) as GapDto[]);
        setSummary(summaryResp);
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        if (err instanceof ApiError) {
          setError(mapApiError(err));
        } else {
          setError({
            kind: "network",
            message: "Ağ hatası. Lütfen bağlantınızı kontrol edin ve tekrar deneyin."
          });
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadInitial();

    return () => {
      abortController.abort();
    };
  }, [id, retryToken]);

  // Polling for status + metrics while run is queued/running.
  useEffect(() => {
    if (!id || !detail) return;
    const normalized = detail.status?.toLowerCase?.() ?? "";
    if (TERMINAL_STATUSES.has(normalized)) {
      return;
    }

    const controller = new AbortController();
    const intervalId = window.setInterval(async () => {
      try {
        const [detailResp, summaryResp] = await Promise.all([
          apiRequest<AuditDetail>(`${apiBaseUrl}/api/Audits/${id}`, {
            signal: controller.signal
          }),
          apiRequest<AuditSummary>(`${apiBaseUrl}/api/Audits/${id}/summary`, {
            signal: controller.signal
          })
        ]);
        setDetail(detailResp);
        setSummary(summaryResp);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        // Polling hatasını sessiz yutuyoruz; mevcut ekrandaki veriyi bozmuyoruz.
        // eslint-disable-next-line no-console
        console.error("AuditDetail polling error", err);
      }
    }, 5000);

    return () => {
      controller.abort();
      clearInterval(intervalId);
    };
  }, [id, detail]);

  if (error) {
    return (
      <ErrorState
        statusCode={error.status}
        title={
          error.kind === "notFound"
            ? "Denetim bulunamadı"
            : "Bir hata oluştu"
        }
        description={
          error.kind === "unauthorized"
            ? "Oturumun geçersiz. Tekrar giriş yap."
            : error.kind === "forbidden"
            ? "Bu kaynağa erişim iznin yok."
            : error.kind === "rateLimited"
            ? "Çok fazla istek. Biraz sonra tekrar dene."
            : error.kind === "server"
            ? "Sunucu hatası. Tekrar dene."
            : error.kind === "network"
            ? "Bağlantı sorunu."
            : error.message
        }
        actions={[
          {
            label: "Tekrar dene",
            onClick: handleRetry,
            variant: "primary",
          },
        ]}
      />
    );
  }

  if (isLoading && !detail) {
    return (
      <LoadingState variant="page" message="Denetim yükleniyor..." />
    );
  }

  if (!detail) {
    return (
      <div className="page-error" role="alert" aria-live="assertive">
        <h2>Denetim yüklenemedi</h2>
        <button
          type="button"
          className="btn"
          onClick={handleRetry}
          aria-label="Denetimi yeniden dene"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  const networkFindingCount = findings.filter(f => f.category === "network").length;
  const consoleFindingCount = findings.filter(f => f.category === "console").length;

  // Basit SKIPPED görünürlüğü: NETWORK_POLICY işareti geçen bulgular.
  const skippedFindings = findings.filter(f => f.status === "SKIPPED");
  const skippedNetworkFindings = skippedFindings.filter(f => f.category === "network");

  function mapSkipReason(reason?: string): string {
    switch (reason) {
      case "NETWORK_POLICY":
        return "Network politikası";
      case "RATE_LIMIT":
        return "Rate limit";
      case "TIMEOUT":
        return "Zaman aşımı";
      case "AUTH_BLOCKED":
        return "Auth engellendi";
      case "ROBOTS":
        return "Robots kuralı";
      case "OTHER":
        return "Diğer";
      default:
        return "";
    }
  }

  const normalizedStatus = detail.status?.toLowerCase?.() ?? "";
  const isCompleted = normalizedStatus === "completed";
  const isFailed = normalizedStatus === "failed";
  const isCanceled = normalizedStatus === "canceled" || normalizedStatus === "cancelled";
  const isRunning = normalizedStatus === "running";
  const isQueued =
    normalizedStatus === "queued" ||
    (!isRunning && !isCompleted && !isFailed && !isCanceled);

  const elapsedMs = summary?.durationMs ?? detail.durationMs;
  const pagesScanned = summary?.linkSampled;
  const retries = detail.retryCount ?? 0;
  const skippedCount = skippedNetworkFindings.length;

  return (
    <main
      className="audit-detail-layout"
      aria-labelledby="audit-detail-heading"
    >
      <div className="audit-main">
        <section className="card audit-summary-card">
        <div className="card-header card-header-row">
          <div>
            <h2 id="audit-detail-heading">Denetim Detayı</h2>
            <a
              href={detail.targetUrl}
              target="_blank"
              rel="noreferrer"
              className="audit-target-url"
              title={detail.targetUrl}
              aria-label={`Hedef URL'i yeni sekmede aç: ${detail.targetUrl}`}
            >
              {detail.targetUrl}
            </a>
          </div>
          <AuditActionsMenu
            auditId={detail.id}
            context={{ detail, findings, gaps }}
          />
        </div>
        <div className="card-body audit-summary-grid">
          <div>
            <span className="summary-label">ID</span>
            <span className="summary-value summary-value-mono">{detail.id}</span>
          </div>
          <div>
            <span className="summary-label">Durum</span>
            <span className="summary-value">
              <StatusBadge status={detail.status} />
            </span>
          </div>
          <div className="audit-timeline" aria-label="Denetim durum zaman çizelgesi">
            <ol className="timeline-list">
              <li
                className={`timeline-step ${isQueued || isRunning || isCompleted || isFailed || isCanceled ? "timeline-step-completed" : ""}`}
                aria-current={isQueued ? "step" : undefined}
              >
                <span className="timeline-step-label">Kuyrukta</span>
              </li>
              <li
                className={`timeline-step ${isRunning || isCompleted || isFailed || isCanceled ? "timeline-step-completed" : ""}`}
                aria-current={isRunning ? "step" : undefined}
              >
                <span className="timeline-step-label">Çalışıyor</span>
              </li>
              <li
                className={`timeline-step ${isCompleted || isFailed || isCanceled ? "timeline-step-completed" : ""}`}
                aria-current={isCompleted || isFailed || isCanceled ? "step" : undefined}
              >
                <span className="timeline-step-label">
                  {isFailed ? "Başarısız" : isCanceled ? "İptal Edildi" : "Tamamlandı"}
                </span>
              </li>
            </ol>
          </div>
          <div>
            <span className="summary-label">Başlangıç</span>
            <span className="summary-value">{formatDateTime(detail.startedAt)}</span>
          </div>
          <div>
            <span className="summary-label">Bitiş</span>
            <span className="summary-value">{formatDateTime(detail.finishedAt)}</span>
          </div>
          <div>
            <span className="summary-label">Süre (ms)</span>
            <span className="summary-value">
              {summary?.durationMs ?? detail.durationMs ?? "-"}
            </span>
          </div>
          <div>
            <span className="summary-label">Örneklenen Link</span>
            <span className="summary-value">
              {summary?.linkSampled ?? detail.linkSampled ?? "-"}
            </span>
          </div>
          <div>
            <span className="summary-label">Kırık Link</span>
            <span className="summary-value">
              {summary?.linkBroken ?? detail.linkBroken ?? "-"}
            </span>
          </div>
          <div>
            <span className="summary-label">Hata Tipi</span>
            <span className="summary-value">
              {detail.errorType ?? "-"}
            </span>
          </div>
          <div>
            <span className="summary-label">Exit Kodu</span>
            <span className="summary-value">
              {typeof detail.lastExitCode === "number" ? detail.lastExitCode : "-"}
            </span>
          </div>
          <div>
            <span className="summary-label">Retry Sayısı</span>
            <span className="summary-value">
              {detail.retryCount ?? 0}
            </span>
          </div>
          {summary?.skippedFindings && summary.skippedFindings > 0 && (
            <div>
              <span className="summary-label">SKIPPED (Network Policy)</span>
              <span className="summary-value">
                {summary.skippedFindings}
              </span>
            </div>
          )}
          {summary && (
            <>
              <div>
                <span className="summary-label">Toplam Bulgu</span>
                <span className="summary-value">{summary.findingsTotal}</span>
              </div>
              <div>
                <span className="summary-label">Kritik / Hata / Uyarı / Bilgi</span>
                <span className="summary-value">
                  {summary.criticalCount}/{summary.errorCount}/
                  {summary.warnCount}/{summary.infoCount}
                </span>
              </div>
              <div>
                <span className="summary-label">Toplam Gap</span>
                <span className="summary-value">{summary.gapsTotal}</span>
              </div>
              <div>
                <span className="summary-label">
                  Gap Dağılımı (Güvenli / Allowlist / Destructive / Auth)
                </span>
                <span className="summary-value">
                  {summary.gapsByRiskSafe}/{summary.gapsByRiskNeedsAllowlist}/
                  {summary.gapsByRiskDestructive}/{summary.gapsByRiskRequiresAuth}
                </span>
              </div>
              <div>
                <span className="summary-label">UI Kapsamı</span>
                <span className="summary-value">
                  {summary.totalElements && summary.totalElements > 0
                    ? `${summary.testedElements ?? 0} / ${summary.totalElements} (${((summary.coverageRatio ?? ((summary.testedElements ?? 0) / summary.totalElements)) * 100).toFixed(1)}%)`
                    : "-"}
                </span>
              </div>
              {summary.maxConsoleErrorPerPage != null && (
                <div>
                  <span className="summary-label">Maksimum Console Hatası (sayfa)</span>
                  <span className="summary-value">{summary.maxConsoleErrorPerPage}</span>
                </div>
              )}
              {summary.topFailingUrl && (
                <div>
                  <span className="summary-label">En Çok Hata Veren URL</span>
                  <span className="summary-value">
                    <a
                      href={summary.topFailingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="audit-target-url"
                      title={summary.topFailingUrl}
                    >
                      {summary.topFailingUrl}
                    </a>
                  </span>
                </div>
              )}
              {summary.mostCommonGapReason && (
                <div>
                  <span className="summary-label">En Sık Gap Nedeni</span>
                  <span className="summary-value">{summary.mostCommonGapReason}</span>
                </div>
              )}
            </>
          )}
          {networkFindingCount > 0 && (
            <div>
              <span className="summary-label">Ağ Bulguları</span>
              <span className="summary-value">{networkFindingCount}</span>
            </div>
          )}
          {consoleFindingCount > 0 && (
            <div>
              <span className="summary-label">Console / JS Hataları</span>
              <span className="summary-value">{consoleFindingCount}</span>
            </div>
          )}
          </div>
        <div
          className="audit-progress-cards"
          aria-label="Tarama ilerleme kartları"
        >
          <div className="progress-card">
            <span className="summary-label">Geçen Süre (ms)</span>
            <span className="summary-value">{elapsedMs ?? "-"}</span>
          </div>
          <div className="progress-card">
            <span className="summary-label">Tahmini Sayfa / Link</span>
            <span className="summary-value">{pagesScanned ?? "-"}</span>
          </div>
          <div className="progress-card">
            <span className="summary-label">Retry Sayısı</span>
            <span className="summary-value">{retries}</span>
          </div>
          <div className="progress-card">
            <span className="summary-label">SKIPPED (Network Policy)</span>
            <span className="summary-value">{skippedCount}</span>
          </div>
          <div className="progress-card">
            <span className="summary-label">İstek Sayısı</span>
            <span className="summary-value">-</span>
          </div>
        </div>
        {detail.status === "failed" && detail.lastError && (
          <div className="card-body">
            <div className="error">
              Son hata: {detail.lastError}
            </div>
          </div>
        )}
        </section>

        <section className="card">
          <div className="card-header">
            <h3>Bulgular</h3>
            <p>Plugin kurallarından üretilen özet bulgular ve dedup grupları.</p>
          </div>
          {findingGroups.length > 0 && (
            <div className="card-body">
              <h4>Bulgu Grupları (Bu tipten X adet)</h4>
              <table className="card-table finding-groups-table">
                <thead>
                  <tr>
                    <th>Seviye</th>
                    <th>Kural</th>
                    <th>Başlık</th>
                    <th>Adet</th>
                  </tr>
                </thead>
                <tbody>
                  {findingGroups.map(group => (
                    <tr key={`${group.ruleId}-${group.title}`}>
                      <td>{group.severity}</td>
                      <td>{group.ruleId}</td>
                      <td>{group.title}</td>
                      <td>{group.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-table-wrapper">
            <table className="card-table">
              <thead>
                <tr>
                  <th>Kural</th>
                  <th>Seviye</th>
                  <th>Kategori</th>
                  <th>Başlık</th>
                  <th>Özet</th>
                </tr>
              </thead>
              <tbody>
                {findings.map(f => {
                  const isSkipped = f.status === "SKIPPED";
                  const reasonLabel = mapSkipReason(f.skipReason as string | undefined);
                  return (
                    <tr key={f.id}>
                      <td>{f.ruleId}</td>
                      <td>{f.severity}</td>
                      <td>{f.category}</td>
                      <td>
                        {f.title}
                        {isSkipped && (
                          <span
                            className="badge-skip"
                            aria-label={
                              reasonLabel
                                ? `SKIPPED: ${reasonLabel}`
                                : "SKIPPED bulgu"
                            }
                          >
                            SKIPPED{reasonLabel ? ` (${reasonLabel})` : ""}
                          </span>
                        )}
                      </td>
                      <td title={f.detail}>
                        {f.detail
                          ? f.detail.length > 80
                            ? `${f.detail.slice(0, 77)}...`
                            : f.detail
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h3>Gaps</h3>
            <p>Element bazında manuel inceleme veya allowlist gereken alanlar.</p>
          </div>
          <div className="card-table-wrapper">
            <table className="card-table">
              <thead>
                <tr>
                  <th>Element</th>
                  <th>İnsan Adı</th>
                  <th>Neden</th>
                  <th>Risk</th>
                  <th>Aksiyon İpucu</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map(g => (
                  <tr key={g.id}>
                    <td>{g.elementId}</td>
                    <td>{g.humanName ?? "-"}</td>
                    <td>{g.reasonCode}</td>
                    <td>{g.riskLevel}</td>
                    <td title={g.actionHint}>
                      {g.actionHint
                        ? g.actionHint.length > 80
                          ? `${g.actionHint.slice(0, 77)}...`
                          : g.actionHint
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <AuditSidebar currentId={detail.id} />
    </main>
  );
}

export default function AuditDetailPage() {
  return (
    <ProtectedRoute>
      <AuditDetailInner />
    </ProtectedRoute>
  );
}


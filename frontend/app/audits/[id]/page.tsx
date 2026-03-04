"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiBaseUrl, apiRequest } from "../../../lib/api";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { AuditSidebar } from "../../../components/AuditSidebar";
import { StatusBadge } from "../../../components/StatusBadge";
import { AuditActionsMenu } from "../../../components/AuditActionsMenu";

interface AuditDetail {
  id: string;
  targetUrl: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  linkSampled?: number;
  linkBroken?: number;
  lastError?: string;
  errorType?: string;
  lastExitCode?: number;
  retryCount?: number;
}

interface FindingDto {
  id: string;
  ruleId: string;
  severity: string;
  category: string;
  title: string;
  detail?: string;
}

interface GapDto {
  id: string;
  elementId: string;
  reasonCode: string;
  riskLevel: string;
  humanName?: string;
  actionHint?: string;
}

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
  maxConsoleErrorPerPage?: number;
  topFailingUrl?: string;
  mostCommonGapReason?: string;
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("tr-TR");
}

function AuditDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [findings, setFindings] = useState<FindingDto[]>([]);
  const [gaps, setGaps] = useState<GapDto[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [detailResp, findingsPage, gapsPage, summaryResp] = await Promise.all([
          apiRequest<AuditDetail>(`${apiBaseUrl}/api/Audits/${id}`),
          apiRequest<{ items: FindingDto[] }>(
            `${apiBaseUrl}/api/Audits/${id}/findings?page=1&pageSize=20`
          ),
          apiRequest<{ items: GapDto[] }>(
            `${apiBaseUrl}/api/Audits/${id}/gaps?page=1&pageSize=20`
          ),
          apiRequest<AuditSummary>(`${apiBaseUrl}/api/Audits/${id}/summary`)
        ]);

        setDetail(detailResp);
        setFindings((findingsPage.items ?? []) as FindingDto[]);
        setGaps((gapsPage.items ?? []) as GapDto[]);
        setSummary(summaryResp);
      } catch (err: any) {
        setError(err.message ?? "Yüklenirken hata oluştu.");
      }
    })();
  }, [id]);

  if (error) {
    return <div className="page-error">{error}</div>;
  }

  if (!detail) {
    return <div className="page-loading">Yükleniyor...</div>;
  }

  const networkFindingCount = findings.filter(f => f.category === "network").length;
  const consoleFindingCount = findings.filter(f => f.category === "console").length;

  return (
    <div className="audit-detail-layout">
      <div className="audit-main">
        <section className="card audit-summary-card">
        <div className="card-header card-header-row">
          <div>
            <h2>Denetim Detayı</h2>
            <a
              href={detail.targetUrl}
              target="_blank"
              rel="noreferrer"
              className="audit-target-url"
              title={detail.targetUrl}
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
            <p>Plugin kurallarından üretilen özet bulgular.</p>
          </div>
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
                {findings.map(f => (
                  <tr key={f.id}>
                    <td>{f.ruleId}</td>
                    <td>{f.severity}</td>
                    <td>{f.category}</td>
                    <td>{f.title}</td>
                    <td title={f.detail}>
                      {f.detail ? (f.detail.length > 80 ? `${f.detail.slice(0, 77)}...` : f.detail) : "-"}
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}

export default function AuditDetailPage() {
  return (
    <ProtectedRoute>
      <AuditDetailInner />
    </ProtectedRoute>
  );
}


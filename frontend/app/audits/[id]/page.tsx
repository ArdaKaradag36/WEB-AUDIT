"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiBaseUrl, authorizedFetch } from "../../../lib/api";
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
}

interface FindingDto {
  id: string;
  ruleId: string;
  severity: string;
  category: string;
  title: string;
}

interface GapDto {
  id: string;
  elementId: string;
  reasonCode: string;
  riskLevel: string;
}

function AuditDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [findings, setFindings] = useState<FindingDto[]>([]);
  const [gaps, setGaps] = useState<GapDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [detailRes, findingsRes, gapsRes] = await Promise.all([
          authorizedFetch(`${apiBaseUrl}/api/Audits/${id}`),
          authorizedFetch(`${apiBaseUrl}/api/Audits/${id}/findings?page=1&pageSize=20`),
          authorizedFetch(`${apiBaseUrl}/api/Audits/${id}/gaps?page=1&pageSize=20`)
        ]);

        if (!detailRes.ok) throw new Error("Audit bulunamadı.");
        const d = await detailRes.json();
        const f = findingsRes.ok ? await findingsRes.json() : { items: [] };
        const g = gapsRes.ok ? await gapsRes.json() : { items: [] };

        setDetail(d as AuditDetail);
        setFindings((f.items ?? []) as FindingDto[]);
        setGaps((g.items ?? []) as GapDto[]);
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

  return (
    <div className="audit-detail-layout">
      <div className="audit-main">
        <section className="card audit-summary-card">
        <div className="card-header card-header-row">
          <div>
            <h2>Denetim Detayı</h2>
            <p>{detail.targetUrl}</p>
          </div>
          <AuditActionsMenu
            auditId={detail.id}
            context={{ detail, findings, gaps }}
          />
        </div>
        <div className="card-body audit-summary-grid">
          <div>
            <span className="summary-label">ID</span>
            <span className="summary-value">{detail.id}</span>
          </div>
          <div>
            <span className="summary-label">Durum</span>
            <span className="summary-value">
              <StatusBadge status={detail.status} />
            </span>
          </div>
          <div>
            <span className="summary-label">Başlangıç</span>
            <span className="summary-value">{detail.startedAt ?? "-"}</span>
          </div>
          <div>
            <span className="summary-label">Bitiş</span>
            <span className="summary-value">{detail.finishedAt ?? "-"}</span>
          </div>
          <div>
            <span className="summary-label">Süre (ms)</span>
            <span className="summary-value">{detail.durationMs ?? "-"}</span>
          </div>
          <div>
            <span className="summary-label">Örneklenen Link</span>
            <span className="summary-value">{detail.linkSampled ?? "-"}</span>
          </div>
          <div>
            <span className="summary-label">Kırık Link</span>
            <span className="summary-value">{detail.linkBroken ?? "-"}</span>
          </div>
        </div>
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
                <th>Önem Düzeyi</th>
                <th>Kategori</th>
                <th>Başlık</th>
              </tr>
            </thead>
            <tbody>
              {findings.map(f => (
                <tr key={f.id}>
                  <td>{f.ruleId}</td>
                  <td>{f.severity}</td>
                  <td>{f.category}</td>
                  <td>{f.title}</td>
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
                <th>Neden</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map(g => (
                <tr key={g.id}>
                  <td>{g.elementId}</td>
                  <td>{g.reasonCode}</td>
                  <td>{g.riskLevel}</td>
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


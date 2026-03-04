"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBaseUrl, apiRequest } from "../lib/api";
import { logError } from "../utils/errorHandler";
import { StatusBadge } from "./StatusBadge";

interface AuditSummary {
  id: string;
  targetUrl: string;
  status: string;
  startedAt?: string;
}

interface Props {
  currentId: string;
}

function formatShortDate(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("tr-TR");
}

export function AuditSidebar({ currentId }: Props) {
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest<AuditSummary[]>(`${apiBaseUrl}/api/Audits`);
        setAudits(data);
      } catch (error) {
        // apiRequest already emitted a toast; just record scope here.
        logError(error, { scope: "AuditSidebar.loadAudits" });
      }
    })();
  }, []);

  return (
    <aside className="audit-sidebar card">
      <div className="card-header">
        <h3>Auditler</h3>
        <p>Son denetimlerin kısa özeti.</p>
      </div>
      <div className="audit-sidebar-body">
        {audits.map(a => {
          const isActive = a.id === currentId;
          return (
            <button
              key={a.id}
              type="button"
              className={
                "audit-sidebar-item" + (isActive ? " audit-sidebar-item-active" : "")
              }
              onClick={() => router.push(`/audits/${a.id}`)}
            >
              <div className="audit-sidebar-row">
                <span className="audit-sidebar-id">{a.id.slice(0, 8)}</span>
                <StatusBadge status={a.status} />
              </div>
              <div className="audit-sidebar-meta">
                <span className="audit-sidebar-url" title={a.targetUrl}>
                  {a.targetUrl}
                </span>
                <span className="audit-sidebar-time">
                  {formatShortDate(a.startedAt)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}


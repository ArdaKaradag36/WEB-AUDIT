"use client";

import { StatusBadge } from "./StatusBadge";
import { AuditActionsMenu } from "./AuditActionsMenu";

export interface AuditSummaryRow {
  id: string;
  targetUrl: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
}

interface Props {
  audits: AuditSummaryRow[];
  onSelect(id: string): void;
  showActions?: boolean;
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("tr-TR");
}

export function AuditListTable({ audits, onSelect, showActions }: Props) {
  return (
    <div className="card-table-wrapper">
      <table className="card-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>URL</th>
            <th>Durum</th>
            <th>Başlangıç</th>
            <th>Bitiş</th>
            {showActions && <th>İşlemler</th>}
          </tr>
        </thead>
        <tbody>
          {audits.map(a => (
            <tr
              key={a.id}
              onClick={() => onSelect(a.id)}
              className="clickable-row"
            >
              <td>{a.id.slice(0, 8)}</td>
              <td className="cell-url" title={a.targetUrl}>
                {a.targetUrl}
              </td>
              <td>
                <StatusBadge status={a.status} />
              </td>
              <td>{formatDateTime(a.startedAt)}</td>
              <td>{formatDateTime(a.finishedAt)}</td>
              {showActions && (
                <td
                  onClick={e => {
                    e.stopPropagation();
                  }}
                >
                  <AuditActionsMenu auditId={a.id} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


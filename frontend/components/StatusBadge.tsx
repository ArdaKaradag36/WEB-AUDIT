"use client";

interface Props {
  status: string;
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Tamamlandı";
    case "failed":
      return "Başarısız";
    case "running":
      return "Devam Ediyor";
    default:
      return status;
  }
}

export function getStatusClass(status: string): string {
  switch (status) {
    case "completed":
      return "status-badge-completed";
    case "failed":
      return "status-badge-failed";
    case "running":
      return "status-badge-running";
    default:
      return "status-badge-default";
  }
}

export function StatusBadge({ status }: Props) {
  const label = getStatusLabel(status);
  const cls = getStatusClass(status);
  return <span className={`status-badge ${cls}`}>{label}</span>;
}


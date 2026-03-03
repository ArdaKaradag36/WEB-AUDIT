"use client";

import { useState, useRef, useEffect } from "react";
import {
  AuditExportContext,
  exportAuditJson,
  exportAuditPdf,
  exportAuditTrace,
  exportFindingsCsv
} from "../lib/exportService";

interface Props {
  auditId: string;
  context?: Omit<AuditExportContext, "auditId">;
}

export function AuditActionsMenu({ auditId, context }: Props) {
  const [open, setOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function getContext(): AuditExportContext {
    return {
      auditId,
      ...(context ?? {})
    };
  }

  async function handleAction(
    key: "json" | "pdf" | "trace" | "csv"
  ) {
    if (busyAction) return;
    setBusyAction(key);
    try {
      const ctx = getContext();
      if (key === "json") {
        await exportAuditJson(ctx);
      } else if (key === "pdf") {
        await exportAuditPdf(ctx);
      } else if (key === "trace") {
        await exportAuditTrace(ctx);
      } else if (key === "csv") {
        await exportFindingsCsv(ctx);
      }
    } finally {
      setBusyAction(null);
      setOpen(false);
    }
  }

  return (
    <div className="actions-menu" ref={ref}>
      <button
        type="button"
        className="actions-menu-button"
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!!busyAction}
      >
        ⋯
      </button>
      {open && (
        <div className="actions-menu-dropdown" role="menu">
          <button
            type="button"
            className="actions-menu-item"
            onClick={() => handleAction("json")}
            disabled={!!busyAction}
          >
            Raporu İndir (JSON)
          </button>
          <button
            type="button"
            className="actions-menu-item"
            onClick={() => handleAction("pdf")}
            disabled={!!busyAction}
          >
            Raporu İndir (PDF)
          </button>
          <button
            type="button"
            className="actions-menu-item"
            onClick={() => handleAction("trace")}
            disabled={!!busyAction}
          >
            Trace İndir
          </button>
          <button
            type="button"
            className="actions-menu-item"
            onClick={() => handleAction("csv")}
            disabled={!!busyAction}
          >
            Bulguları Dışa Aktar (CSV)
          </button>
        </div>
      )}
    </div>
  );
}


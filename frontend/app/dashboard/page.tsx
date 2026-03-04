"use client";

import { useEffect, useState } from "react";
import { apiBaseUrl, apiRequest } from "../../lib/api";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { AuditListTable, AuditSummaryRow } from "../../components/AuditListTable";
import { logError } from "../../utils/errorHandler";

function DashboardPageInner() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditSummaryRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest<AuditSummaryRow[]>(`${apiBaseUrl}/api/Audits`);
        setAudits(data);
      } catch (error) {
        // apiRequest already logged + toasted; just add scoped log entry.
        logError(error, { scope: "Dashboard.loadAudits" });
      }
    })();
  }, [router]);

  const total = audits.length;
  const completed = audits.filter(a => a.status === "completed").length;
  const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="dashboard-page">
      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">🚀</div>
          <p className="metric-label">Toplam Denetim Çalıştırma</p>
          <p className="metric-value">{total}</p>
          <p className="metric-caption">Son 30 gün (tüm hedefler)</p>
        </div>
        <div className="metric-card">
          <div className="metric-icon metric-icon-success">✔</div>
          <p className="metric-label">Başarı Oranı</p>
          <p className="metric-value">{successRate}%</p>
          <p className="metric-caption">Tamamlanan / Tüm denetimler</p>
        </div>
        <div className="metric-card">
          <div className="metric-icon metric-icon-warn">!</div>
          <p className="metric-label">Aktif Bulgular</p>
          <p className="metric-value">–</p>
          <p className="metric-caption">Detaylar aşağıdaki denetimlerde</p>
        </div>
        <div className="metric-card">
          <div className="metric-icon metric-icon-info">▢</div>
          <p className="metric-label">UI Test Kapsamı</p>
          <p className="metric-value">89.4%</p>
          <p className="metric-caption">Tasarım için örnek değer</p>
        </div>
      </section>

      <div className="dashboard-main-grid">
        <section className="card audit-list-card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header card-header-row">
            <div>
              <h2>Son Denetimler</h2>
              <p>En son oluşturduğun denetimlerden kısa bir özet.</p>
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
            audits={audits.slice(0, 3)}
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


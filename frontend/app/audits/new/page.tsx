"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBaseUrl, apiRequest } from "../../../lib/api";
import { logError } from "../../../utils/errorHandler";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { AuditListTable, AuditSummaryRow } from "../../../components/AuditListTable";

function NewAuditPageInner() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditSummaryRow[]>([]);
  const [url, setUrl] = useState("");
  const [useCredentials, setUseCredentials] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorNote, setTwoFactorNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest<AuditSummaryRow[]>(`${apiBaseUrl}/api/Audits`);
        setAudits(data);
      } catch (error) {
        logError(error, { scope: "NewAuditPage.loadAudits" });
      }
    })();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = useCredentials
        ? {
            audit: { targetUrl: url },
            username: username || null,
            password: password || null,
            twoFactorNote: twoFactorNote || null
          }
        : { targetUrl: url };

      const endpoint = useCredentials
        ? `${apiBaseUrl}/api/Audits/with-credentials`
        : `${apiBaseUrl}/api/Audits`;

      const created = await apiRequest<AuditSummaryRow>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      setAudits(prev => [created, ...prev]);
      setUrl("");
      setUsername("");
      setPassword("");
      setTwoFactorNote("");
    } catch (err: any) {
      setError(err.message ?? "Bilinmeyen hata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-main-grid">
        <section className="card new-audit-card">
          <div className="card-header">
            <h2>Yeni Denetim</h2>
            <p>Hedef URL gir ve isteğe bağlı olarak kimlik bilgisi ekle.</p>
          </div>
          <form onSubmit={handleCreate} className="card-body">
            <label>
              Hedef URL
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.gov.tr"
                required
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={useCredentials}
                onChange={e => setUseCredentials(e.target.checked)}
              />
              Giriş gerektiren hedef için kimlik bilgisi kullan
            </label>
            {useCredentials && (
              <div className="credentials">
                <label>
                  Kullanıcı Adı
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                </label>
                <label>
                  Şifre
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  2FA Notu
                  <textarea
                    value={twoFactorNote}
                    onChange={e => setTwoFactorNote(e.target.value)}
                  />
                </label>
              </div>
            )}
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading} className="primary-button">
              {loading ? "Gönderiliyor..." : "Audit Başlat"}
            </button>
          </form>
        </section>

        <section className="card audit-list-card">
          <div className="card-header card-header-row">
            <div>
              <h2>Son Denetimler</h2>
              <p>Son oluşturduğun denetimlerin özeti.</p>
            </div>
          </div>
          <AuditListTable
            audits={audits}
            onSelect={id => router.push(`/audits/${id}`)}
            showActions={false}
          />
        </section>
      </div>
    </div>
  );
}

export default function NewAuditPage() {
  return (
    <ProtectedRoute>
      <NewAuditPageInner />
    </ProtectedRoute>
  );
}


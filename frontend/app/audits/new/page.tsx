"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiBaseUrl, apiRequest, ApiError } from "../../../lib/api";
import { logError } from "../../../utils/errorHandler";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { AuditListTable, AuditSummaryRow } from "../../../components/AuditListTable";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";

function NewAuditPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [audits, setAudits] = useState<AuditSummaryRow[]>([]);
  const [url, setUrl] = useState("");
  const [useCredentials, setUseCredentials] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorNote, setTwoFactorNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ statusCode?: number; message: string } | null>(null);

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

  // URL parametresinden (targets sayfasından) gelen hedefi başlangıç değeri olarak ata.
  useEffect(() => {
    const initialUrl = searchParams.get("targetUrl");
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [searchParams]);

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
      setUsername("");
      setPassword("");
      setTwoFactorNote("");

      // Yeni denetim başarıyla oluşturulduktan sonra detay sayfasına git.
      router.push(`/audits/${created.id}`);
    } catch (err: any) {
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
            : err.message || "Denetim oluşturulurken bir hata oluştu.";
        setError({ statusCode: err.status, message });
      } else {
        setError({ message: "Bağlantı sorunu." });
      }
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
            {error && (
              <ErrorState
                statusCode={error.statusCode}
                title="Denetim oluşturulamadı"
                description={error.message}
                actions={[
                  {
                    label: "Tekrar dene",
                    onClick: (e) => {
                      // form submit butonuna bastıkça handleCreate tekrar çalışır, ekstra bir şey yapmaya gerek yok
                      (e.currentTarget as HTMLButtonElement).form?.requestSubmit();
                    },
                    variant: "primary",
                  },
                ]}
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="primary-button"
              aria-label={loading ? "Denetim isteği gönderiliyor" : "Yeni denetim başlat"}
            >
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


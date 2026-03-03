"use client";

import { ProtectedRoute } from "../../components/ProtectedRoute";

function DocsInner() {
  return (
    <div className="docs-page">
      <section className="docs-intro">
        <h1>Dokümantasyon</h1>
        <p>
          Kamu Web Audit sisteminin mimarisi, API uçları ve runner davranışına dair
          teknik dokümantasyon giriş sayfası.
        </p>
      </section>

      <section className="docs-grid">
        <article className="card">
          <div className="card-header">
            <h2>Sistem Mimarisi</h2>
            <p>
              Kamu Web Audit, katmanlı bir mimari üzerinde çalışan, denetim ve raporlama
              için tasarlanmış modüler bir platformdur.
            </p>
          </div>
          <div className="card-body">
            <ul className="docs-list">
              <li>Katmanlı mimari (.NET API, Runner, Rule Engine)</li>
              <li>Backend (.NET 8 Web API)</li>
              <li>Runner (Node.js 20 + Playwright)</li>
              <li>Rule Engine (plugin tabanlı kural setleri)</li>
              <li>Raporlama ve artifact (JSON, trace, PDF) üretimi</li>
            </ul>
            <h3 className="docs-subtitle">Veri akışı (özet)</h3>
            <ol className="docs-flow-list">
              <li>Denetim isteği kullanıcı arayüzünden veya API üzerinden oluşturulur.</li>
              <li>Runner, hedef URL&apos;yi Playwright ile ziyaret eder.</li>
              <li>Tanımlı kurallar (pluginler) çalıştırılır.</li>
              <li>Bulgular normalize edilir ve yapılandırılmış forma dönüştürülür.</li>
              <li>Rapor ve kanıt dosyaları veri tabanına ve dosya sistemine kaydedilir.</li>
            </ol>
            <button type="button" className="primary-button docs-card-button">
              Detaylı Mimari Diyagramı
            </button>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>Backend API</h2>
            <p>
              Sistemle entegrasyon ve denetim yaşam döngüsünün yönetimi için kullanılan
              REST tabanlı API uçları.
            </p>
          </div>
          <div className="card-body">
            <ul className="docs-list">
              <li>GET /api/audits</li>
              <li>GET /api/audits/{`{id}`}</li>
              <li>POST /api/audits</li>
              <li>GET /api/audits/{`{id}`}/report</li>
              <li>GET /api/audits/{`{id}`}/trace</li>
            </ul>
            <p className="docs-helper-text">
              Tüm uçlar JWT ile korunur ve kullanıcı/rol bazlı yetkilendirme uygulanır.
            </p>
            <button type="button" className="link-button docs-card-button">
              OpenAPI Dokümantasyonu
            </button>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>Runner Plugin Mimarisi</h2>
            <p>
              Playwright tabanlı tarayıcı motoru üzerinde çalışan, plugin tabanlı kural
              ve analiz sistemi.
            </p>
          </div>
          <div className="card-body">
            <ul className="docs-list">
              <li>Plugin tabanlı kural sistemi</li>
              <li>Console log analizi ve uyarı toplama</li>
              <li>HTTP hata ve timeout yakalama</li>
              <li>DOM element taraması ve seçici stabilitesi</li>
              <li>UI kapsama ve gezinme senaryoları</li>
            </ul>
            <p className="docs-helper-text">
              Runner, Playwright tabanlı bir tarayıcı motoru kullanarak hedef sistemi
              ziyaret eder ve kural motoru üzerinden analiz gerçekleştirir. Her kural
              modüler bir plugin olarak tanımlanabilir.
            </p>
            <button type="button" className="primary-button docs-card-button">
              Plugin Geliştirme Rehberi
            </button>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>Güvenlik ve Observability</h2>
            <p>
              Üretim ortamı için güvenlik kontrolleri, loglama ve gözlemlenebilirlik
              araçlarının entegrasyonu.
            </p>
          </div>
          <div className="card-body">
            <ul className="docs-list">
              <li>Merkezi uygulama ve audit loglama</li>
              <li>İstisna ve hata izleme</li>
              <li>CPU / RAM izleme ve sağlık uçları</li>
              <li>Audit log kayıtları ve erişim izi</li>
              <li>Rol bazlı erişim kontrolü (RBAC)</li>
            </ul>
            <div className="docs-actions-row">
              <button type="button" className="link-button docs-card-button">
                Güvenlik Politikası
              </button>
              <button type="button" className="link-button docs-card-button">
                Observability Rehberi
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

export default function DocsPage() {
  return (
    <ProtectedRoute>
      <DocsInner />
    </ProtectedRoute>
  );
}


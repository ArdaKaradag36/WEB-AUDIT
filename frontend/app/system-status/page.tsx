"use client";

export default function SystemStatusPage() {
  return (
    <div className="static-page">
      <h1>System Status</h1>
      <p>
        Backend API, runner ve veritabanı için basit bir durum özeti. Gerçek
        durum, üretimde harici bir status sayfasına taşınabilir.
      </p>
      <section>
        <h2>Bileşenler</h2>
        <ul>
          <li>Backend API – <strong>Healthy</strong> (health/ready endpoint)</li>
          <li>Runner (Node + Playwright) – <strong>Healthy</strong> (background service)</li>
          <li>PostgreSQL – <strong>Healthy</strong> (EF Core bağlantısı)</li>
        </ul>
      </section>
      <section>
        <h2>Kontrol Noktaları</h2>
        <ul>
          <li>
            <code>/health/ready</code> – API ve veritabanı bağlantısı
          </li>
          <li>
            <code>/metrics</code> – Prometheus metrikleri (queue depth, running
            count, completed totals vb.)
          </li>
        </ul>
      </section>
    </div>
  );
}


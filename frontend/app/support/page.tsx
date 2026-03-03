"use client";

export default function SupportPage() {
  return (
    <div className="static-page">
      <h1>Support</h1>
      <p>
        Kamu Web Audit için destek taleplerini ve geri bildirimleri burada
        toplayabilirsiniz.
      </p>
      <section>
        <h2>İletişim</h2>
        <ul>
          <li>E-posta: support@kamu-audit.local (örnek)</li>
          <li>Issue takibi: GitHub / Azure DevOps board&apos;u</li>
        </ul>
      </section>
      <section>
        <h2>Sık Konular</h2>
        <ul>
          <li>Login sorunları</li>
          <li>Audit başlatılamıyor veya queued durumda kalıyor</li>
          <li>Runner logları ve özel plugin geliştirme soruları</li>
        </ul>
      </section>
    </div>
  );
}


"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="static-page">
      <h1>Kamu Web Audit</h1>
      <p>
        Kurum içi web sitelerinizin erişilebilirlik, güvenlik ve kalite
        standartlarına uygunluğunu otomatik olarak denetleyen çok kullanıcılı
        bir ürün.
      </p>
      <section>
        <h2>Ne İşe Yarar?</h2>
        <ul>
          <li>URL girerek hızlıca web denetimi başlatırsın.</li>
          <li>
            Runner, sayfaları gezip linkleri tıklar, plugin&apos;ler üzerinden
            bulgular üretir.
          </li>
          <li>
            Sonuçları dashboard üzerinden; findings, gaps ve metrikler olarak
            görürsün.
          </li>
        </ul>
      </section>
      <section>
        <h2>Öne Çıkan Özellikler</h2>
        <ul>
          <li>Section 508 / WCAG odaklı denetim kuralları</li>
          <li>Kimlik bilgisi gerektiren siteler için güvenli credential akışı</li>
          <li>Audit geçmişi, metrikler ve loglarla uçtan uca izlenebilirlik</li>
        </ul>
      </section>
      <button
        type="button"
        className="primary-button"
        onClick={() => router.push("/login")}
      >
        Login / Register
      </button>
    </div>
  );
}

"use client";

export default function PrivacyPolicyPage() {
  return (
    <div className="static-page">
      <h1>Privacy Policy</h1>
      <p>
        Bu sayfa, Kamu Web Audit ürününü kullanırken toplanan verilerin nasıl
        işlendiği ile ilgili varsayılan bir örnektir. Gerçek projede kurumunuzun
        gizlilik politikası ile değiştirmeniz gerekir.
      </p>
      <section>
        <h2>Toplanan Veriler</h2>
        <ul>
          <li>Kullanıcı hesabı bilgileri (e-posta, rol)</li>
          <li>Audit çalıştırma geçmişi ve hedef URL&apos;ler</li>
          <li>Log ve metrikler (operasyonel amaçlarla)</li>
        </ul>
      </section>
    </div>
  );
}


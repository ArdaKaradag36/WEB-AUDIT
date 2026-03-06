"use client";

import { useRouter } from "next/navigation";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-2 text-sm text-slate-500">{hint}</div>
    </div>
  );
}

function FeatureCard({
  eyebrow,
  title,
  description,
  items,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-700 ring-1 ring-inset ring-blue-100">
        {icon}
      </div>

      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>

      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm leading-6 text-slate-700">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-full text-slate-900 selection:bg-blue-200 selection:text-slate-950">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.14),_transparent_32%)]" />
        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-16 md:pb-24 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                </span>
                Web Audit Platform v2.0
              </div>

              <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Kamu ve kurumsal sistemler için
                <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  merkezi web denetim kontrol paneli
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                Erişilebilirlik, güvenlik, kalite ve operasyonel tutarlılık denetimlerini
                tek merkezden yönet. Audit çalıştır, bulguları izle, raporları karşılaştır
                ve problemli alanları ekip bazında görünür hale getir.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:bg-slate-900"
                >
                  Sisteme Giriş Yap
                </button>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <StatCard label="Denetim Tipleri" value="12+" hint="Erişilebilirlik, kalite, güvenlik ve UI coverage" />
                <StatCard label="Raporlama" value="JSON + UI" hint="Detaylı çıktı, geçmiş kıyaslama ve izlenebilirlik" />
                <StatCard label="Çalışma Modeli" value="Multi-user" hint="Kurumsal kullanım için merkezi yönetim akışı" />
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[32px] border border-slate-200 bg-white/90 p-4 shadow-2xl shadow-slate-200/70 backdrop-blur">
                <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
                        Audit Overview
                      </div>
                      <div className="mt-1 text-xl font-bold">Control Center</div>
                    </div>
                    <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      Online
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs text-slate-400">Aktif Audit</div>
                      <div className="mt-2 text-3xl font-bold">18</div>
                      <div className="mt-2 text-xs text-emerald-300">+4 son 24 saat</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs text-slate-400">Kritik Bulgu</div>
                      <div className="mt-2 text-3xl font-bold">27</div>
                      <div className="mt-2 text-xs text-amber-300">Önceliklendirme gerekli</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold">Denetim Sağlık Skoru</div>
                      <div className="text-sm font-bold text-blue-300">84 / 100</div>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>Coverage stabil</span>
                      <span>Latency kabul edilebilir</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {[
                      {
                        title: "nvi.gov.tr",
                        status: "Running",
                        tone: "text-blue-300",
                      },
                      {
                        title: "kurum-portal.local",
                        status: "Queued",
                        tone: "text-amber-300",
                      },
                      {
                        title: "internal-docs.gov",
                        status: "Completed",
                        tone: "text-emerald-300",
                      },
                    ].map((row) => (
                      <div
                        key={row.title}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-white">{row.title}</div>
                          <div className="text-xs text-slate-400">Son audit akışı sistemde kayıtlı</div>
                        </div>
                        <div className={`text-xs font-bold uppercase tracking-[0.16em] ${row.tone}`}>
                          {row.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Security
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-900">Credential-safe audit flow</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Kimlik doğrulamalı sistemlerde güvenli giriş akışı ve kontrollü tarama senaryoları.
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Reporting
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-900">Actionable findings</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Bulguları severity, gap ve evidence bazında yorumlayarak operasyon ekiplerine aktar.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Platform Yaklaşımı
            </div>
            <div className="mt-3 text-xl font-bold tracking-tight text-slate-950">
              Tarama, analiz ve raporlama tek akışta
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Kullanıcı URL girer, sistem taramayı başlatır, runner sayfaları analiz eder ve sonuçlar
              dashboard üzerinden ölçülebilir hale gelir.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Operasyonel Güç
            </div>
            <div className="mt-3 text-xl font-bold tracking-tight text-slate-950">
              Çok kullanıcılı ve kurumsal kullanıma uygun
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Audit geçmişi, kullanıcı akışları, oturum yönetimi ve rapor görünürlüğü tek merkezde toplanır.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Değer Önerisi
            </div>
            <div className="mt-3 text-xl font-bold tracking-tight text-slate-950">
              Teknik borcu görünür hale getirir
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Findings, gaps, evidence ve coverage metrikleri sayesinde teknik riskler ölçülebilir olur.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-8 max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Ana Yetenekler
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Ürünü sadece güzel değil, kurumsal olarak güven veren hale getir
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Aşağıdaki yapı landing page üzerinde ürünün teknik kapasitesini ve operasyonel değerini net gösterir.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <FeatureCard
            eyebrow="Audit Engine"
            title="Otomatik tarama ve bulgu üretimi"
            description="Sistem; sayfa dolaşımı, kural bazlı inceleme ve çıktı üretimini tek bir denetim pipeline’ında birleştirir."
            items={[
              "Hedef URL üzerinden hızlı audit başlatma akışı",
              "Runner bot ile link gezme, etkileşim ve veri toplama",
              "Findings, gaps, coverage ve metrik odaklı sonuç modeli",
            ]}
            icon={
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />

          <FeatureCard
            eyebrow="Compliance & Quality"
            title="Erişilebilirlik, güvenlik ve kalite odağı"
            description="Teknik denetim yalnızca görsel doğrulama değil; standart uyumu ve risk görünürlüğü de üretir."
            items={[
              "WCAG / Section 508 benzeri erişilebilirlik kontrolleri",
              "Kimlik doğrulamalı sistemler için güvenli audit yaklaşımı",
              "Uygulanabilir severity ve remediation odaklı raporlama",
            ]}
            icon={
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            }
          />

          <FeatureCard
            eyebrow="Observability"
            title="Denetlenebilir ve izlenebilir operasyon"
            description="Sadece test koşmak yetmez; sistemin ne bulduğunu, neyi atladığını ve ne kadar kapsadığını da göstermek gerekir."
            items={[
              "Audit geçmişi ve trend izleme yaklaşımı",
              "Detaylı metrik, coverage ve durum görünürlüğü",
              "Kurumsal dashboard mantığıyla merkezi operasyon takibi",
            ]}
            icon={
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 3a1 1 0 011 1v6.586l2.293 2.293a1 1 0 01-1.414 1.414l-2.586-2.586A1 1 0 0110 11V4a1 1 0 011-1zm0 0a8 8 0 100 16 8 8 0 000-16zm8 8h2m-18 0H1"
                />
              </svg>
            }
          />

          <FeatureCard
            eyebrow="Enterprise UX"
            title="Karar verdiren arayüz"
            description="Landing page yalnızca tanıtım değil; ürünün güvenilirliğini ve teknik olgunluğunu yansıtmalıdır."
            items={[
              "Temiz bilgi hiyerarşisi ve net CTA kurgusu",
              "Modern control panel estetiği ve responsive yapı",
              "Kurumsal kullanıcıyı ikna eden güçlü ilk izlenim",
            ]}
            icon={
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 7h18M6 11h12M8 15h8M4 19h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v12a1 1 0 001 1z"
                />
              </svg>
            }
          />
        </div>
      </section>
    </div>
  );
}
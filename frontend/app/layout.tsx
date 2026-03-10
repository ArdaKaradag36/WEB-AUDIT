"use client";

import "./globals.css";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserMenu } from "../components/UserMenu";
import { ToastContainer } from "../components/ToastContainer";
import { storageUsageFromNumbers } from "../lib/mappers/audits";
import { mockStorageUsage, mockSidebarStats } from "../lib/mock/dashboard";

type NavItem = {
  path: string;
  label: string;
  isDoc?: boolean;
  icon: React.ReactNode;
};

function AppLogo({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 text-left transition-opacity hover:opacity-90"
      aria-label="Ana sayfaya git"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-600/20">
        K
      </div>

      {!compact && (
        <div>
          <div className="text-base font-semibold tracking-tight text-white md:text-slate-950">
            Kamu Web Audit
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300 md:text-blue-600">
            Audit Control Plane
          </div>
        </div>
      )}
    </button>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Mobil menü açıkken body scroll kilidi + ESC ile kapatma
  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const isActive = (...prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(p));

  const isPublicShell =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/privacy-policy") ||
    pathname.startsWith("/terms-of-service") ||
    pathname.startsWith("/accessibility-statement");

  const pageTitle = useMemo(() => {
    if (pathname.startsWith("/audits/new")) return "Yeni Denetim";
    if (pathname.startsWith("/audits/")) return "Denetim Detayı";
    if (pathname.startsWith("/reports")) return "Raporlar";
    if (pathname.startsWith("/settings")) return "Ayarlar";
    if (pathname.startsWith("/documentation") || pathname.startsWith("/docs")) return "Dokümantasyon";
    if (pathname.startsWith("/support")) return "Destek";
    return "Gösterge Paneli";
  }, [pathname]);

  const pageDescription = useMemo(() => {
    if (pathname.startsWith("/audits/new")) return "Yeni tarama başlat, kapsam belirle ve çalıştır.";
    if (pathname.startsWith("/audits/")) return "Çalışan veya tamamlanan denetimin detay görünümü.";
    if (pathname.startsWith("/reports")) return "Geçmiş raporları, bulguları ve çıktı özetlerini incele.";
    if (pathname.startsWith("/settings")) return "Sistem tercihleri, güvenlik ve entegrasyon ayarları.";
    if (pathname.startsWith("/documentation") || pathname.startsWith("/docs"))
      return "Teknik dokümantasyon, kullanım rehberleri ve standartlar.";
    if (pathname.startsWith("/support")) return "Destek talepleri, yardım kanalları ve durum bilgileri.";
    return "Sistem sağlığı, denetim akışı ve operasyon görünümü.";
  }, [pathname]);

  const handleLogoClick = () => {
    if (isPublicShell) {
      router.push("/");
    } else {
      router.push("/dashboard");
    }
    setMobileMenuOpen(false);
  };

  const navItems: NavItem[] = [
    {
      path: "/dashboard",
      label: "Gösterge Paneli",
      icon: (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 6a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm9 0a2 2 0 012-2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3a2 2 0 01-2-2V6zm-9 9a2 2 0 012-2h3a2 2 0 012 2v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5zm9 2h7"
          />
        </svg>
      ),
    },
    {
      path: "/audits/new",
      label: "Yeni Denetim",
      icon: (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v14m7-7H5" />
        </svg>
      ),
    },
    {
      path: "/reports",
      label: "Raporlar",
      icon: (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 17v-2m3 2v-5m3 5V7m2 12H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      path: "/settings",
      label: "Ayarlar",
      icon: (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      path: "/docs",
      label: "Dokümantasyon",
      isDoc: true,
      icon: (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
    },
    {
      path: "/support",
      label: "Destek",
      icon: (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4-.8L3 20l1.12-3.359A7.545 7.545 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
    },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="border-b border-white/10 px-5 py-5">
        <AppLogo onClick={handleLogoClick} />
      </div>

      <div className="px-4 py-5">
        <div className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Navigasyon
        </div>

        <nav className="space-y-1.5" aria-label="Uygulama menüsü">
          {navItems.map((item) => {
            const active = isActive(item.path, item.isDoc ? "/documentation" : "");

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  router.push(item.path);
                  setMobileMenuOpen(false);
                }}
                className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                  active
                    ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/20 text-white ring-1 ring-inset ring-blue-500/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4">
        {(() => {
          const storage = storageUsageFromNumbers(
            mockStorageUsage.usedGb,
            mockStorageUsage.totalGb
          );
          return (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Storage
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {storage.usedGb.toFixed(1)} GB / {storage.totalGb} GB
                  </div>
                </div>
                <div className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-300">
                  {Math.round(storage.usedPercent)}%
                </div>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                  style={{ width: `${storage.usedPercent}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                  <div className="text-[11px] text-slate-500">Aktif Audit</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {mockSidebarStats.activeAudits}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                  <div className="text-[11px] text-slate-500">Hata Oranı</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    %{mockSidebarStats.errorRatePercent}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );

  return (
    <html lang="tr">
      <body className="bg-slate-50 font-sans text-slate-900 antialiased">
        {isPublicShell ? (
          <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.10),_transparent_35%),linear-gradient(to_bottom,_#f8fafc,_#eef2ff)]">
            <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
              <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
                <div className="md:hidden">
                  <button
                    type="button"
                    onClick={handleLogoClick}
                    className="flex items-center gap-3"
                    aria-label="Ana sayfaya git"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-600/20">
                      K
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-slate-950">Kamu Web Audit</div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                        Control Plane
                      </div>
                    </div>
                  </button>
                </div>

                <div className="hidden md:block">
                  <button type="button" onClick={handleLogoClick}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-600/20">
                        K
                      </div>
                      <div className="text-left">
                        <div className="text-base font-semibold text-slate-950">Kamu Web Audit</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                          Audit Control Plane
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                <nav className="flex items-center gap-3" aria-label="Ana gezinme">
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="hidden rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white md:inline-flex"
                  >
                    Ana Sayfa
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="inline-flex items-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    Giriş Yap
                  </button>
                </nav>
              </div>
            </header>

            <main>{children}</main>
          </div>
        ) : (
          <div className="flex min-h-screen bg-slate-100">
            <aside className="hidden w-80 shrink-0 border-r border-white/10 lg:block">
              <SidebarContent />
            </aside>

            {mobileMenuOpen && (
              <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Menüyü kapat"
                />
                <div
                  id="mobile-sidebar"
                  className="absolute inset-y-0 left-0 w-[88%] max-w-xs shadow-2xl"
                >
                  <SidebarContent />
                </div>
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
              <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
                <div className="flex min-h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(prev => !prev)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:hidden"
                      aria-label={mobileMenuOpen ? "Menüyü kapat" : "Menüyü aç"}
                      aria-expanded={mobileMenuOpen}
                      aria-controls="mobile-sidebar"
                    >
                      {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
                    </button>

                    <div className="min-w-0">
                      <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                        {pageTitle}
                      </h1>
                      <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">
                        {pageDescription}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 md:flex">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                        Üretim
                      </span>
                    </div>

                    <div className="hidden h-6 w-px bg-slate-200 md:block" />
                    <UserMenu />
                  </div>
                </div>
              </header>

              <main className="flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                <div className="mx-auto w-full max-w-7xl">{children}</div>
              </main>
            </div>
          </div>
        )}

        <ToastContainer />
      </body>
    </html>
  );
}
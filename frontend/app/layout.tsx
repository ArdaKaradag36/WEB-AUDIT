"use client";

import "./globals.css";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserMenu } from "../components/UserMenu";
import { ToastContainer } from "../components/ToastContainer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (...prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(p));

  const isPublicShell =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/privacy-policy") ||
    pathname.startsWith("/terms-of-service") ||
    pathname.startsWith("/accessibility-statement");

  let pageTitle = "Gösterge Paneli";
  if (pathname.startsWith("/audits/new")) {
    pageTitle = "Yeni Denetim";
  } else if (pathname.startsWith("/audits/")) {
    pageTitle = "Denetim Detayı";
  } else if (pathname.startsWith("/reports")) {
    pageTitle = "Raporlar";
  } else if (pathname.startsWith("/settings")) {
    pageTitle = "Ayarlar";
  } else if (pathname.startsWith("/documentation") || pathname.startsWith("/docs")) {
    pageTitle = "Dokümantasyon";
  }

  const handleLogoClick = () => {
    if (isPublicShell) {
      router.push("/");
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <html lang="tr">
      <body>
        <>
          {isPublicShell ? (
            <div className="auth-shell">
              <header className="top-nav">
                <button
                  type="button"
                  className="top-nav-logo"
                  onClick={handleLogoClick}
                >
                  <div className="top-nav-logo-icon">K</div>
                  <div className="top-nav-logo-text">
                    <span className="top-nav-logo-title">Kamu Web Audit</span>
                    <span className="top-nav-logo-sub">Gov Compliance</span>
                  </div>
                </button>
                <nav className="top-nav-links" aria-label="Ana gezinme">
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="top-nav-link-button"
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="top-nav-link-button"
                  >
                    Login
                  </button>
                </nav>
              </header>
              <main className="auth-main">{children}</main>
            </div>
          ) : (
            <div className="shell">
              <aside className="sidebar" aria-label="Uygulama menüsü">
                <button
                  type="button"
                  className="sidebar-brand"
                  onClick={handleLogoClick}
                >
                  <div className="sidebar-brand-icon">K</div>
                  <div>
                    <div className="sidebar-brand-title">Kamu Audit</div>
                    <div className="sidebar-brand-sub">Gov Compliance</div>
                  </div>
                </button>
                <nav className="sidebar-nav">
                  <button
                    type="button"
                    className={isActive("/dashboard") ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                    onClick={() => router.push("/dashboard")}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      📊
                    </span>
                    <span>Gösterge Paneli</span>
                  </button>
                  <button
                    type="button"
                    className={isActive("/audits/new") ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                    onClick={() => router.push("/audits/new")}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      ➕
                    </span>
                    <span>Yeni Denetim</span>
                  </button>
                  <button
                    type="button"
                    className={isActive("/reports") ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                    onClick={() => router.push("/reports")}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      📄
                    </span>
                    <span>Raporlar</span>
                  </button>
                  <button
                    type="button"
                    className={isActive("/settings") ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                    onClick={() => router.push("/settings")}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      ⚙️
                    </span>
                    <span>Ayarlar</span>
                  </button>
                  <button
                    type="button"
                    className={isActive("/docs", "/documentation") ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                    onClick={() => router.push("/docs")}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      📚
                    </span>
                    <span>Dokümantasyon</span>
                  </button>
                  <button
                    type="button"
                    className={isActive("/support") ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                    onClick={() => router.push("/support")}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      💬
                    </span>
                    <span>Destek</span>
                  </button>
                </nav>
                <div className="sidebar-footer">
                  <div className="storage-card">
                    <div className="storage-label">Storage Usage</div>
                    <div className="storage-bar">
                      <div className="storage-bar-fill" />
                    </div>
                    <div className="storage-text">64.2 GB of 100 GB</div>
                  </div>
                </div>
              </aside>
              <div className="shell-main">
                <header className="shell-header">
                  <div className="shell-header-left">
                    <h1 className="shell-title">{pageTitle}</h1>
                  </div>
                  <div className="shell-header-right">
                    <div className="env-pill">
                      <span className="env-dot" />
                      <span className="env-text">ÜRETİM ORTAMI</span>
                    </div>
                    <UserMenu />
                  </div>
                </header>
                <main className="shell-content">{children}</main>
              </div>
            </div>
          )}
          <ToastContainer />
        </>
      </body>
    </html>
  );
}

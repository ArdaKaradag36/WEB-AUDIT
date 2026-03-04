"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiBaseUrl } from "../../lib/api";
import { captureUnexpectedError } from "../../utils/errorHandler";
import { loginWithToken } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await fetch(`${apiBaseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, role: "QA" })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Kayıt başarısız.");
        }
      }

      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Giriş başarısız.");
      }
      const body = await res.json();
      const token = body.token as string;
      // Mevcut auth yapısı localStorage üzerinde çalışıyor; token'ı kaydet.
      loginWithToken(token);
      router.push("/dashboard");
    } catch (err: any) {
      captureUnexpectedError(err, { scope: "LoginPage.handleSubmit" });
      setError(err.message ?? "Bilinmeyen hata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-hero">
      <div className="login-card">
        <div className="login-left">
          <h1 className="login-title">Login to Kamu</h1>
          <p className="login-subtitle">
            Kurumsal web denetimi ve otomasyonunu merkezi olarak yönetin.
          </p>

          <div className="auth-toggle">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label>
              Government Email
              <input
                type="email"
                placeholder="name@agency.gov"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading} className="login-submit">
              {loading ? "Gönderiliyor..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
            <p className="login-footer-text">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => setMode("register")}
              >
                Contact Administrator
              </button>
            </p>
          </form>
        </div>
        <div className="login-right">
          <h2>Enterprise Compliance</h2>
          <p>
            Section 508 ve WCAG denetimlerini kurum genelinde otomatikleştir,
            gerçek zamanlı raporlar üret.
          </p>
          <div className="login-right-grid">
            <div>
              <h3>24/7</h3>
              <p>Uptime monitor</p>
            </div>
            <div>
              <h3>FIPS</h3>
              <p>Security validated</p>
            </div>
            <div>
              <h3>Audit Trails</h3>
              <p>End-to-end visibility</p>
            </div>
            <div>
              <h3>Gov Ready</h3>
              <p>Kamu kurumlarına özel</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


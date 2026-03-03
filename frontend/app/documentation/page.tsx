"use client";

import { ProtectedRoute } from "../../components/ProtectedRoute";

function DocumentationInner() {
  return (
    <div className="static-page">
      <h1>Documentation</h1>
      <p>
        Kamu Web Audit mimarisi, API uçları ve runner davranışına dair özet
        teknik doküman giriş sayfası.
      </p>
      <ul>
        <li>Backend API özet linkleri</li>
        <li>Runner plugin yapısı</li>
        <li>Güvenlik ve gözlemlenebilirlik dokümanlarına bağlantılar</li>
      </ul>
    </div>
  );
}

export default function DocumentationPage() {
  return (
    <ProtectedRoute>
      <DocumentationInner />
    </ProtectedRoute>
  );
}


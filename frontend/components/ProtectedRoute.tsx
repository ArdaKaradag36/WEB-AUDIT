"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";

interface Props {
  children: ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  if (!ready) {
    return <div className="page-loading">Yükleniyor...</div>;
  }

  if (!isAuthenticated) {
    // Redirecting to /login
    return null;
  }

  return <>{children}</>;
}


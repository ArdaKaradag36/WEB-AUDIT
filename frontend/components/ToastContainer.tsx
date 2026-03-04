"use client";

import { useEffect, useState } from "react";
import { registerToastListener } from "../utils/errorHandler";

type ToastLevel = "info" | "success" | "warning" | "error";

type ToastState = {
  id: number;
  message: string;
  level: ToastLevel;
};

const AUTO_DISMISS_MS = 3500;

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  useEffect(() => {
    let idCounter = 0;

    const listener = (message: string, level: ToastLevel) => {
      const id = ++idCounter;
      setToasts(prev => [...prev, { id, message, level }]);
      window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, AUTO_DISMISS_MS);
    };

    registerToastListener(listener);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" aria-atomic="true">
      {toasts.map(t => (
        <div
          key={t.id}
          className={
            "toast " +
            (t.level === "success"
              ? "toast-success"
              : t.level === "info"
              ? "toast-success"
              : "toast-error")
          }
          role="status"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}


export type ErrorContext = {
  scope?: string;
  extra?: Record<string, unknown>;
};

/**
 * Centralized frontend error logger.
 * In the future this can be wired to a remote logging/telemetry service.
 */
export function logError(error: unknown, context?: ErrorContext): void {
  // eslint-disable-next-line no-console
  console.error("[Kamu-Web-Frontend] Error:", {
    error,
    scope: context?.scope,
    extra: context?.extra,
  });
}

// Minimal toast mechanism: delegate to a registered listener when available.
type ToastLevel = "info" | "success" | "warning" | "error";

type ToastListener = (message: string, level: ToastLevel) => void;

let toastListener: ToastListener | null = null;

export function registerToastListener(listener: ToastListener) {
  toastListener = listener;
}

export function showToast(message: string, level: ToastLevel = "error") {
  if (toastListener) {
    toastListener(message, level);
    return;
  }

  if (typeof window !== "undefined") {
    // Fallback: basic alert when no UI layer is wired.
    // eslint-disable-next-line no-alert
    window.alert(message);
  }
}

/**
 * Helper for unexpected errors where the caller has no specific UX.
 */
export function captureUnexpectedError(error: unknown, context?: ErrorContext) {
  logError(error, context);
  showToast("Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
}


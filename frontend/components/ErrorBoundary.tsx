"use client";

import React from "react";
import { captureUnexpectedError } from "../utils/errorHandler";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Generic React error boundary for client components.
 * Wrap shells or high-value sections to avoid white-screen failures.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureUnexpectedError(error, {
      scope: "ReactErrorBoundary",
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="page-error">
          Beklenmeyen bir hata oluştu. Sayfayı yenilemeyi deneyebilirsiniz.
        </div>
      );
    }

    return this.props.children;
  }
}


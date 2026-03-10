export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";

import { getToken } from "./auth";
import { captureUnexpectedError, logError, showToast } from "../utils/errorHandler";

export async function authorizedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = typeof window !== "undefined" ? getToken() : null;

  const headers = new Headers(init.headers ?? {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export class ApiError extends Error {
  status: number;
  title?: string;
  detail?: string;
  errorCode?: string;
  traceId?: string;

  constructor(
    message: string,
    status: number,
    title?: string,
    detail?: string,
    errorCode?: string,
    traceId?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errorCode = errorCode;
    this.traceId = traceId;
  }
}

type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
  traceId?: string;
  errorCode?: string;
};

async function parseProblemDetails(response: Response): Promise<ProblemDetails | null> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) return null;

  try {
    const json = (await response.json()) as unknown;
    if (!json || typeof json !== "object") return null;
    return json as ProblemDetails;
  } catch (error) {
    logError(error, { scope: "parseProblemDetails" });
    return null;
  }
}

/**
 * High-level JSON API helper.
 * - Attaches auth header via authorizedFetch
 * - Parses ProblemDetails and throws ApiError on failure
 * - Emits user-friendly toast by default
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${apiBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

  let response: Response;
  try {
    response = await authorizedFetch(url, init);
  } catch (error) {
    const isAbortError =
      typeof error === "object" &&
      error !== null &&
      // DOMException.name === "AbortError" tarayıcı tarafında
      // veya fetch implementasyonlarının kullandığı benzer isimler
      ( // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name === "AbortError" ||
        (error as any).code === "ABORT_ERR"
      );

    if (isAbortError) {
      // Component unmount / effect cleanup gibi senaryolarda beklenen iptaller.
      // Kullanıcıya toast göstermiyoruz, sadece hatayı yukarı fırlatıyoruz;
      // çoğu çağıran AbortController üzerinden zaten bu iptali yoksayar.
      throw error;
    }

    logError(error, { scope: "apiRequest.fetch", extra: { url } });
    // Gerçek network hatası: backend'e hiç ulaşamadık veya CORS / bağlantı sorunu.
    const networkMessage = "Ağ hatası. Lütfen bağlantınızı kontrol edin ve tekrar deneyin.";
    showToast(networkMessage, "error");
    throw new ApiError(networkMessage, 0, "Network error");
  }

  if (response.ok) {
    if (response.status === 204) {
      // no content
      return undefined as T;
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      captureUnexpectedError(error, { scope: "apiRequest.parseOk", extra: { url } });
      throw new ApiError("Sunucudan beklenmeyen yanıt alındı.", response.status);
    }
  }

  const problem = await parseProblemDetails(response);
  let message = "Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.";

  if (problem?.detail) {
    message = problem.detail;
  } else if (problem?.title) {
    message = problem.title;
  } else {
    try {
      const text = await response.text();
      if (text) {
        message = text;
      }
    } catch (error) {
      logError(error, { scope: "apiRequest.readText", extra: { url } });
    }
  }

  const apiError = new ApiError(
    message,
    problem?.status ?? response.status,
    problem?.title,
    problem?.detail,
    problem?.errorCode,
    problem?.traceId
  );
  logError(apiError, {
    scope: "apiRequest.error",
    extra: { url, status: response.status, errorCode: problem?.errorCode, traceId: problem?.traceId },
  });
  showToast(message, "error");
  throw apiError;
}



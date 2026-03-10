"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { apiBaseUrl, apiRequest, ApiError } from "../../lib/api";
import { logError } from "../../utils/errorHandler";
import type { AuditSummaryRow } from "../../components/AuditListTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";

interface FindingDto {
  id: string;
  ruleId: string;
  severity: string;
  category: string;
  title: string;
  detail?: string;
  meta?: unknown;
  status?: "OK" | "SKIPPED" | "FAILED" | "INFO";
  skipReason?: "NETWORK_POLICY" | "RATE_LIMIT" | "TIMEOUT" | "AUTH_BLOCKED" | "ROBOTS" | "OTHER";
}

interface FindingGroupDto {
  ruleId: string;
  severity: string;
  category: string;
  title: string;
  count: number;
}

interface PagedFindingsResponse {
  items: FindingDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  groups: FindingGroupDto[];
}

const SEVERITIES = ["critical", "error", "warn", "info"] as const;
const STATUSES = ["OK", "SKIPPED", "FAILED", "INFO"] as const;
const SKIP_REASONS = [
  "NETWORK_POLICY",
  "RATE_LIMIT",
  "TIMEOUT",
  "AUTH_BLOCKED",
  "ROBOTS",
  "OTHER",
] as const;

function FindingsExplorerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [audits, setAudits] = useState<AuditSummaryRow[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [titleSearch, setTitleSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [skipReasonFilter, setSkipReasonFilter] = useState<string | null>(null);
  const [urlContains, setUrlContains] = useState("");
  const [minConfidence, setMinConfidence] = useState<number | null>(null);
  const [findings, setFindings] = useState<FindingDto[]>([]);
  const [groups, setGroups] = useState<FindingGroupDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ statusCode?: number; message: string } | null>(null);

  useEffect(() => {
    const sev = searchParams.get("severity");
    const cat = searchParams.get("category");
    const url = searchParams.get("url");
    const minConf = searchParams.get("minConfidence");
    const status = searchParams.getAll("status");
    const skip = searchParams.get("skipReason");

    if (sev) setSeverityFilter(sev);
    if (cat) setCategoryFilter(cat);
    if (url) setUrlContains(url);
    if (minConf) {
      const v = Number(minConf);
      if (!Number.isNaN(v)) setMinConfidence(v);
    }
    if (status.length > 0) setStatusFilters(status);
    if (skip) setSkipReasonFilter(skip);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiRequest<AuditSummaryRow[]>(`${apiBaseUrl}/api/Audits`);
        if (cancelled) return;

        setAudits(data);
        const latest = data[0];
        if (latest) {
          setSelectedAuditId(latest.id);
        }
      } catch (err: any) {
        if (cancelled) return;

        if (err instanceof ApiError) {
          const message =
            err.status === 401
              ? "Oturumun geçersiz. Tekrar giriş yap."
              : err.status === 403
              ? "Bu kaynağa erişim iznin yok."
              : err.status === 429
              ? "Çok fazla istek. Biraz sonra tekrar dene."
              : err.status >= 500
              ? "Sunucu hatası. Tekrar dene."
              : err.message || "Denetim listesi yüklenirken bir hata oluştu.";

          setError({ statusCode: err.status, message });
        } else {
          setError({ message: "Bağlantı sorunu." });
        }

        logError(err, { scope: "FindingsExplorer.loadAudits" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedAuditId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const url = new URL(`${apiBaseUrl}/api/Audits/${selectedAuditId}/findings`);
        url.searchParams.set("page", "1");
        url.searchParams.set("pageSize", "200");

        if (severityFilter) url.searchParams.append("severity", severityFilter);
        if (categoryFilter) url.searchParams.append("category", categoryFilter);
        statusFilters.forEach((s) => url.searchParams.append("status", s));
        if (urlContains.trim()) url.searchParams.set("url", urlContains.trim());
        if (minConfidence != null) url.searchParams.set("minConfidence", String(minConfidence));
        if (skipReasonFilter && statusFilters.includes("SKIPPED")) {
          url.searchParams.append("skipReason", skipReasonFilter);
        }

        const uiParams = new URLSearchParams();
        if (severityFilter) uiParams.set("severity", severityFilter);
        if (categoryFilter) uiParams.set("category", categoryFilter);
        if (urlContains.trim()) uiParams.set("url", urlContains.trim());
        if (minConfidence != null) uiParams.set("minConfidence", String(minConfidence));
        statusFilters.forEach((s) => uiParams.append("status", s));
        if (skipReasonFilter && statusFilters.includes("SKIPPED")) {
          uiParams.set("skipReason", skipReasonFilter);
        }

        const queryForUi = uiParams.toString();
        router.replace(queryForUi ? `?${queryForUi}` : "?", { scroll: false });

        const resp = await apiRequest<PagedFindingsResponse>(url.toString());
        if (cancelled) return;

        setFindings(resp.items ?? []);
        setGroups(resp.groups ?? []);
      } catch (err: any) {
        if (cancelled) return;

        if (err instanceof ApiError) {
          const message =
            err.status === 401
              ? "Oturumun geçersiz. Tekrar giriş yap."
              : err.status === 403
              ? "Bu kaynağa erişim iznin yok."
              : err.status === 429
              ? "Çok fazla istek. Biraz sonra tekrar dene."
              : err.status >= 500
              ? "Sunucu hatası. Tekrar dene."
              : err.message || "Bulgular yüklenirken bir hata oluştu.";

          setError({ statusCode: err.status, message });
        } else {
          setError({ message: "Bağlantı sorunu." });
        }

        logError(err, {
          scope: "FindingsExplorer.loadFindings",
          extra: { selectedAuditId },
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedAuditId,
    severityFilter,
    categoryFilter,
    statusFilters,
    skipReasonFilter,
    urlContains,
    minConfidence,
    router,
  ]);

  const filteredFindings = useMemo(() => {
    if (!titleSearch.trim()) return findings;

    const q = titleSearch.toLowerCase();
    return findings.filter((f) => {
      const text = `${f.title} ${f.detail ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [findings, titleSearch]);

  function mapSkipReason(reason?: string): string {
    switch (reason) {
      case "NETWORK_POLICY":
        return "Network politikası";
      case "RATE_LIMIT":
        return "Rate limit";
      case "TIMEOUT":
        return "Zaman aşımı";
      case "AUTH_BLOCKED":
        return "Auth engellendi";
      case "ROBOTS":
        return "Robots kuralı";
      case "OTHER":
        return "Diğer";
      default:
        return "";
    }
  }

  function formatAuditOption(a: AuditSummaryRow): string {
    const date = a.startedAt ?? a.finishedAt;
    return `${a.targetUrl} (${a.status}${date ? ` – ${new Date(date).toLocaleString("tr-TR")}` : ""})`;
  }

  const resetFilters = () => {
    setSeverityFilter(null);
    setCategoryFilter(null);
    setTitleSearch("");
    setUrlContains("");
    setStatusFilters([]);
    setSkipReasonFilter(null);
    setMinConfidence(null);
    router.replace("?", { scroll: false });
  };

  if (!selectedAuditId && loading) {
    return (
      <ProtectedRoute>
        <LoadingState variant="page" message="Bulgular yükleniyor..." />
      </ProtectedRoute>
    );
  }

  if (error && !selectedAuditId) {
    return (
      <ProtectedRoute>
        <ErrorState
          statusCode={error.statusCode}
          title="Bulgular yüklenemedi"
          description={error.message}
          actions={[
            {
              label: "Tekrar dene",
              onClick: () => router.refresh(),
              variant: "primary",
            },
          ]}
        />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="findings-page">
        <section className="card findings-filters-card">
          <div className="card-header card-header-with-meta">
            <div>
              <span className="section-eyebrow">İnceleme Paneli</span>
              <h2>Findings Explorer</h2>
              <p>Seçilen denetimdeki bulguları filtrele, grupla ve teknik görünümü sade biçimde incele.</p>
            </div>

            <div className="findings-stats-chip">
              <span>{groups.length} grup</span>
              <span className="findings-stats-separator" />
              <span>{filteredFindings.length} bulgu</span>
            </div>
          </div>

          <div className="card-body findings-filters-grid findings-filters-grid-updated">
            <label className="settings-field findings-field findings-field-wide">
              <span className="settings-field-label">Denetim</span>
              <select
                value={selectedAuditId ?? ""}
                onChange={(e) => setSelectedAuditId(e.target.value || null)}
                aria-label="Denetim seç"
              >
                <option value="">Seçiniz...</option>
                {audits.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatAuditOption(a)}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field findings-field">
              <span className="settings-field-label">Kategori</span>
              <select
                value={categoryFilter ?? ""}
                onChange={(e) => setCategoryFilter(e.target.value ? e.target.value : null)}
                aria-label="Kategori filtresi"
              >
                <option value="">Tümü</option>
                <option value="security_headers">Security Headers</option>
                <option value="network">Network</option>
                <option value="form">Form</option>
                <option value="link">Link</option>
                <option value="ui_coverage">UI Coverage</option>
                <option value="blocker">Blocker</option>
              </select>
            </label>

            <label className="settings-field findings-field">
              <span className="settings-field-label">URL contains</span>
              <input
                type="text"
                value={urlContains}
                onChange={(e) => setUrlContains(e.target.value)}
                placeholder="Örn. /login"
              />
            </label>

            <label className="settings-field findings-field">
              <span className="settings-field-label">Başlık / Detay Arama</span>
              <input
                type="text"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                placeholder="Örn. HSTS, CSRF, CSP..."
              />
            </label>

            <label className="settings-field findings-field">
              <span className="settings-field-label">Min confidence</span>
              <select
                value={minConfidence == null ? "" : String(minConfidence)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) setMinConfidence(null);
                  else setMinConfidence(Number(v));
                }}
                aria-label="Minimum confidence filtresi"
              >
                <option value="">Any</option>
                <option value="0.25">≥ 0.25</option>
                <option value="0.5">≥ 0.5</option>
                <option value="0.75">≥ 0.75</option>
                <option value="0.9">≥ 0.9</option>
              </select>
            </label>

            <fieldset className="settings-field filter-panel">
              <legend className="settings-field-label">Severity</legend>
              <div className="compact-option-grid">
                <label className="compact-option-row">
                  <span>Tümü</span>
                  <input
                    type="radio"
                    name="severityFilter"
                    checked={severityFilter === null}
                    onChange={() => setSeverityFilter(null)}
                  />
                </label>
                {SEVERITIES.map((s) => (
                  <label key={s} className="compact-option-row">
                    <span>{s}</span>
                    <input
                      type="radio"
                      name="severityFilter"
                      checked={severityFilter === s}
                      onChange={() => setSeverityFilter(s)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="settings-field filter-panel">
              <legend className="settings-field-label">Status</legend>
              <div className="compact-option-grid">
                {STATUSES.map((s) => (
                  <label key={s} className="compact-option-row">
                    <span>{s}</span>
                    <input
                      type="checkbox"
                      checked={statusFilters.includes(s)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setStatusFilters((prev) => (prev.includes(s) ? prev : [...prev, s]));
                        } else {
                          setStatusFilters((prev) => prev.filter((x) => x !== s));
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            {statusFilters.includes("SKIPPED") && (
              <label className="settings-field findings-field">
                <span className="settings-field-label">Skip reason</span>
                <select
                  value={skipReasonFilter ?? ""}
                  onChange={(e) => setSkipReasonFilter(e.target.value || null)}
                  aria-label="Skip reason filtresi"
                >
                  <option value="">Tümü</option>
                  {SKIP_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {mapSkipReason(r)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="findings-filter-actions">
              <button type="button" className="secondary-button" onClick={resetFilters}>
                Filtreleri temizle
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="page-loading findings-loading" role="status" aria-live="polite">
            Bulgular yükleniyor...
          </div>
        ) : error ? (
          <ErrorState
            statusCode={error.statusCode}
            title="Bulgular yüklenemedi"
            description={error.message}
            actions={[
              {
                label: "Tekrar dene",
                onClick: () => router.refresh(),
                variant: "primary",
              },
            ]}
          />
        ) : (
          <div className="findings-grid findings-grid-updated">
            <section className="card">
              <div className="card-header">
                <h3>Gruplanmış Bulgular</h3>
                <p>RuleId ve başlık bazında tekilleştirilmiş özet görünüm.</p>
              </div>
              <div className="card-table-wrapper">
                <table className="card-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Rule</th>
                      <th>Başlık</th>
                      <th>Adet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={`${g.ruleId}-${g.title}`}>
                        <td>{g.severity}</td>
                        <td>{g.ruleId}</td>
                        <td>{g.title}</td>
                        <td>{g.count}</td>
                      </tr>
                    ))}
                    {groups.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <EmptyState
                            title="Filtrelere uyan grup bulunamadı"
                            description="Filtreleri gevşeterek veya farklı bir denetim seçerek tekrar deneyebilirsin."
                            actionLabel="Filtreleri temizle"
                            onAction={resetFilters}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h3>Bulgu Listesi</h3>
                <p>Seçilen denetimdeki bireysel kayıtlar ve kısa açıklamaları.</p>
              </div>
              <div className="card-table-wrapper">
                <table className="card-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Rule</th>
                      <th>Kategori</th>
                      <th>Başlık</th>
                      <th>Özet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFindings.map((f) => {
                      const isSkipped = f.status === "SKIPPED";
                      const reasonLabel = mapSkipReason(f.skipReason as string | undefined);

                      return (
                        <tr key={f.id}>
                          <td>{f.severity}</td>
                          <td>{f.ruleId}</td>
                          <td>{f.category}</td>
                          <td>
                            <div className="finding-title-cell">
                              <span>{f.title}</span>
                              {isSkipped && (
                                <span
                                  className="badge-skip"
                                  aria-label={reasonLabel ? `SKIPPED: ${reasonLabel}` : "SKIPPED bulgu"}
                                >
                                  SKIPPED{reasonLabel ? ` (${reasonLabel})` : ""}
                                </span>
                              )}
                            </div>
                          </td>
                          <td title={f.detail}>
                            {f.detail
                              ? f.detail.length > 100
                                ? `${f.detail.slice(0, 97)}...`
                                : f.detail
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredFindings.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState
                            title="Filtrelere uyan bulgu bulunamadı"
                            description="Farklı URL, severity veya status kombinasyonları deneyebilirsin."
                            actionLabel="Filtreleri temizle"
                            onAction={resetFilters}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

export default function FindingsExplorerPage() {
  return <FindingsExplorerInner />;
}
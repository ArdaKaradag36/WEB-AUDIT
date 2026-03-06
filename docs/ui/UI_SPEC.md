# Kamu Web Audit – UI Tasarım Spesifikasyonu (Nessus-benzeri)

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit için Nessus-benzeri bir web UI’ın **sayfa akışını**, temel bileşenlerini
ve kabaca wireframe yapısını tanımlar. Bu aşamada **yalnızca plan/wireframe** üretilmiştir; kod yoktur.

---

## 1. Genel Layout ve Navigasyon

- Üstte **global navbar**:
  - Sol: ürün logo + isim (Kamu Web Audit).
  - Orta: ana menü linkleri:
    - `Dashboard`
    - `Targets`
    - `Scans`
    - `Findings`
    - `Auth Profiles`
    - `Settings`
  - Sağ: kullanıcı menüsü:
    - Kullanıcı adı / rol (Admin / User / Auditor),
    - `Profile`, `Logout`.
- Solda (opsiyonel) **contextual sidebar**:
  - Scan detail sayfasında: scan navigation (Summary, Findings, Coverage, Evidence).
  - Findings explorer’da: filtre paneli.
- Orta alan: sayfa içeriği (grid/kartlar, tablolar, timeline).

Görsel stil:

- Modern, sade, kurum rengi uyumlu (ör. mavi/gri),
- Fazla renkli değil, ama **severity** (critical/high/medium/low/info) için renk kodları (kırmızı/turuncu/sarı/mavi/yeşil),
- Nessus / Security Center tarzı kartlar + bar/pie chart’lar.

---

## 2. Dashboard – Trend + Last Scans

### 2.1. Wireframe (metin)

- **Üst satır – Metrik kartları (4 kolon)**:
  - Card 1: `Total Scans` (son 30 gün / tüm zaman).
  - Card 2: `Open Findings` (kritik+yüksek).
  - Card 3: `Average Scan Duration` (ms/dk).
  - Card 4: `Skipped (Network Policy)` (son 30 gün).

- **Orta satır – Grafikler (2 kolon)**:
  - Sol: `Scan Trend` line chart:
    - X ekseni: zaman (hafta/gün),
    - Y ekseni: tamamlana/başarısız tarama sayısı,
    - Filtre: `All / Per Target / Per System`.
  - Sağ: `Findings by Severity` stacked bar/pie:
    - Seviyelere göre adetler.

- **Alt satır – Son taramalar tablosu**:
  - Kolonlar:
    - `Started At`,
    - `Target`,
    - `Status` (badge),
    - `Critical / High / Medium / Low / Info` sayıları,
    - `Duration`,
    - `Actions` (View scan).
  - Satır tıklanınca `Scan detail` sayfasına gider.

### 2.2. Bileşenler

- `DashboardCard` – metrik kartları.
- `TrendChart` – line chart.
- `SeverityDistributionChart` – bar/pie.
- `ScansTable` – son taramalar tablosu.

---

## 3. Targets Sayfası

### 3.1. Wireframe

- Üst bölüm: `New Target` butonu (sağda).
- Ana içerik:
  - Filtre satırı:
    - Search box (name/baseUrl),
    - Risk profile filter (PUBLIC/INTERNAL/HIGH_SENSITIVITY),
    - Aktif/Pasif toggle.
  - Targets tablosu:
    - `Name`,
    - `Base URL`,
    - `Risk Profile` (badge),
    - `Last Scan Summary` (son taramanın tarihi ve durum özeti),
    - `Open Findings` (kritik/yüksek sayıları),
    - `Actions`:
      - `View scans`,
      - `Start scan`.

- `New Target` modalı:
  - Form:
    - `Name`,
    - `Base URL`,
    - `Organization/Project` (opsiyonel),
    - `Default Scan Profile` (quick/standard/deep),
    - `Default Auth Profile` (dropdown),
    - Risk profile seçimi.

### 3.2. Bileşenler

- `TargetListTable`
- `TargetFilters`
- `TargetFormModal`

---

## 4. Scan Detail Sayfası

### 4.1. Wireframe

- Üst başlık alanı:
  - `Target URL`,
  - `Scan ID` / `Run ID`,
  - `Status` (queued/running/completed/failed/blocked),
  - Butonlar:
    - `Re-run with same config`,
    - `Download report.json`,
    - (ileride) `Export PDF`.

- Sol sidebar (sekme benzeri):
  - `Summary` (varsayılan),
  - `Timeline`,
  - `Coverage`,
  - `Findings`,
  - `Evidence`.

- **Summary sekmesi**:
  - Kartlar:
    - `Overall score (CVSS-like)`,
    - `Critical/High/Medium/Low/Info counts`,
    - `Duration`, `Pages scanned`, `Requests total`, `Skipped (Network Policy)`.
  - `Top Risks` listesi:
    - Her satır: severity badge + kural başlığı + “Bu tipten X adet” + `View finding template`.

- **Timeline sekmesi**:
  - Zaman çizelgesi (vertical):
    - `Scan requested`,
    - `Queued`,
    - `Running`,
    - `Results ingested`,
    - `Report generated`.
  - Her adım için timestamp ve opsiyonel event detayı (örn. network policy nedeniyle erken sonlandırma).

- **Coverage sekmesi**:
  - UI coverage:
    - Barlar: `Tested / Skipped / Failed / Attempted no effect`,
    - `Top skip reasons`.
  - Network coverage:
    - `Requests total / 4xx-5xx / failed / skippedNetwork`.

- **Findings sekmesi**:
  - `FindingsTable` (scan’a scoped, findings explorer’ın basit versiyonu):
    - Seviyeye göre renkli satırlar,
    - `Rule`, `Title`, `URL`, `Parameter`, `Count`, `Actions`.

- **Evidence sekmesi**:
  - Artefakt listesi:
    - `summary.json`, `ui-inventory.json`, `gaps.json`,
    - `console.json`, `network.json`, `request_failed.json`,
    - Playwright `trace.zip`, screenhot’lar.

### 4.2. Bileşenler

- `ScanSummaryHeader`
- `ScanTimeline`
- `CoverageOverview`
- `ScanFindingsTable`
- `EvidenceList`

---

## 5. Findings Explorer

### 5.1. Wireframe

- Sayfa başlığı: `Findings Explorer`
- Üstte filtre paneli (sol) + sonuç özeti (sağ).

- **Sol filtre paneli**:
  - Severity checkboxes:
    - Critical / High / Medium / Low / Info.
  - Category filter:
    - security_headers, form, network, link, ui_coverage, blocker, js, etc.
  - URL filter:
    - Text input (prefix match),
    - `Target` dropdown (filter by target URL).
  - Confidence slider:
    - 0.0–1.0 arası aralık; min. confidence eşiği.
  - Date range picker:
    - `From` / `To` (audit run tarihine göre).

- **Sağ sonuç alanı**:
  - Summary strip:
    - “Toplam X bulgu (Y scan üzerinden).”
  - Findings tablosu (paged):
    - Kolonlar:
      - `Severity`,
      - `Rule Id`,
      - `Title`,
      - `Target / URL`,
      - `Last Seen`,
      - `Templates Count / Occurrence Count` (ör. `3 templates / 10 instances`),
      - `Actions`:
        - `View template`,
        - `View in scan`.

### 5.2. Bileşenler

- `FindingFiltersPanel`
- `FindingSummaryStrip`
- `FindingExplorerTable`

---

## 6. Finding Template View

### 6.1. Wireframe

- Başlık: `Finding Template – {RuleId} – {Title}`
- Üstte:
  - `Rule ID`, `Severity`, `Category`,
  - `Canonical URL`, `Parameter`,
  - `Occurrences total`: `OccurrenceCount`,
  - `First Seen`, `Last Seen`,
  - `AutoRiskLowerSuggested` badge (varsa).

- Sekmeler:
  - `Overview`:
    - Açıklama + remediation,
    - Özet istatistikler:
      - `Occurrences per target`,
      - `Occurrences over time` (sparkline).
  - `Instances`:
    - Tablo:
      - `Detected At`,
      - `AuditRunId`,
      - `URL`,
      - `Parameter`,
      - `Actions` (View scan detail).
  - `Evidence`:
    - `Meta` ve örnek evidence alanları (header snippet, mixed content URL’leri vb.).

### 6.2. Bileşenler

- `FindingTemplateHeader`
- `FindingTemplateStats`
- `FindingInstancesTable`
- `FindingEvidencePanel`

---

## 7. Auth Profiles Wizard

### 7.1. Wireframe

- Sayfa başlığı: `Auth Profiles`
- Üstte `New Auth Profile` butonu.
- Liste:
  - `Name`,
  - `Type` (None, BasicAuth, Cookie/Session, FormLoginSteps),
  - `Last Used`,
  - `Targets Using This Profile`,
  - `Actions`: Edit / Delete.

- `New Auth Profile` wizard (çok adımlı modal):
  1. **Type selection**:
     - Kartlar:
       - None,
       - BasicAuth,
       - Cookie/Session,
       - FormLoginSteps.
  2. **Config step** (type’a göre):
     - BasicAuth:
       - Username, Password (masked), note alanı.
     - Cookie/Session:
       - “Record session” açıklaması, snapshot ID (read-only),
       - Hangi target’lar ile kullanılacağı.
     - FormLoginSteps:
       - `Entry URL`,
       - `Steps` (goto/fill/click/assertText/assertUrl) builder:
         - Her step için satır: “Action type” dropdown + argüman inputları,
         - Step ekleme/silme butonları.
  3. **Review & Save**:
     - Json/deklaratif config özetini gösterir,
     - “Save & Test” butonu (ileride login executor ile basit smoke test).

### 7.2. Bileşenler

- `AuthProfileList`
- `AuthProfileWizard`
- `LoginStepEditor` (form login steps DSL editörü)

---

## 8. Settings Sayfası

### 8.1. Wireframe

- Sol tarafta Settings navigation:
  - `Rate Limiting`,
  - `Scan Budgets`,
  - `Security` (SSRF allow/deny),
  - `Observability` (OTEL endpoint, log level).

- **Rate Limiting**:
  - Form:
    - AuthPolicy: `login per minute` (numeric),
    - AuditCreatePolicy: `scan create per minute` (numeric),
    - ReportPolicy (ileride): `report download per minute`.

- **Scan Budgets**:
  - Global default profiller:
    - Quick: `maxPages`, `maxDepth`, `maxDuration`.
    - Standard, Deep profilleri.

- **Security**:
  - SSRF allow/deny:
    - Denylist host/IP listesi (textarea veya tag input),
    - (İleride) Allowlist domain listesi.

- **Observability**:
  - OTLP endpoint,
  - Log level (Info/Warn/Error),
  - “Include PII in logs” (varsayılan kapalı).

### 8.2. Bileşenler

- `SettingsNav`
- `RateLimitSettingsForm`
- `ScanBudgetSettingsForm`
- `SecuritySettingsForm`
- `ObservabilitySettingsForm`

---

## 9. Component Breakdown (Özet)

- **Layout**
  - `AppShell` (navbar + optional sidebar + content)
  - `Sidebar`, `TopNav`, `UserMenu`
- **Dashboard**
  - `DashboardCard`, `TrendChart`, `SeverityDistributionChart`, `ScansTable`
- **Targets**
  - `TargetListTable`, `TargetFilters`, `TargetFormModal`
- **Scans**
  - `ScanSummaryHeader`, `ScanTimeline`, `CoverageOverview`, `ScanFindingsTable`, `EvidenceList`
- **Findings**
  - `FindingFiltersPanel`, `FindingSummaryStrip`, `FindingExplorerTable`,
  - `FindingTemplateHeader`, `FindingTemplateStats`, `FindingInstancesTable`, `FindingEvidencePanel`
- **Auth**
  - `AuthProfileList`, `AuthProfileWizard`, `LoginStepEditor`
- **Settings**
  - `SettingsNav`, `RateLimitSettingsForm`, `ScanBudgetSettingsForm`, `SecuritySettingsForm`, `ObservabilitySettingsForm`

Bu spesifikasyon, UI implementasyonu sırasında bileşenlerin hiyerarşisini ve sayfa akışını
gösterir; görsel detaylar ve etkileşimler implementasyon aşamasında tasarımcılarla birlikte netleştirilecektir.


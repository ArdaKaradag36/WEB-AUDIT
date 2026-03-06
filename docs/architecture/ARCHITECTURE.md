# Kamu Web Audit – Layered Architecture

Bu doküman, **Kamu Web Audit** sisteminin hedeflenen **layered architecture** yapısını tanımlar.  
Amaç; UI, API, Application, Domain ve Infrastructure katmanlarını net sorumluluklar ve bağımlılık yönleriyle ayırmak, “web application security scanner platformu” için sürdürülebilir bir temel oluşturmaktır.

---

## 1. Yüksek Seviye Katmanlar ve Bağımlılıklar

Mantıksal katmanlar ve bağımlılık yönü:

```text
Presentation (UI - Next.js)
        |
        v
    API (REST - .NET Controllers)
        |
        v
Application (Use Cases / Services)
        |
        v
   Domain (Entities, Value Objects, Policies)

Infrastructure (DB, Runner, Queue, Integrations)
        ^           ^
        |           |
        +-----------+
   (Application, Domain için implementasyonlar)
```

- **İçeri doğru** bağımlılık: Her katman yalnızca kendisinden **daha içte** olan katmanlara bağımlı olabilir.
- **Domain** en içteki, en “saf” katmandır; UI, HTTP, DB, Playwright, queue vb. detayları bilmez.
- **Infrastructure**, Domain ve Application’ın tanımladığı **abstraction / port**’ları gerçekleştirir.

---

## 2. Presentation Layer (UI)

### 2.1. Sorumluluklar

- Kullanıcıya sunulan web arayüzü (Next.js / React).
- Kimlik doğrulama akışı (login form, JWT token alma, session yönetimi).
- Audit lifecycle ekranları:
  - Audit oluşturma (target URL, scan profile, rule pack seçimi, credentials referansı vb.).
  - Audit listesi, detay, summary, findings, gaps view’ları.
- Raportlama ve dashboard’lar:
  - Organization / project / target seviyesinde risk görünümü.
  - Trend grafikleri, filtreler, export butonları.
- Kullanıcı deneyimi (navigasyon, state yönetimi, form validasyonları – **yalnızca UI seviyesinde**).

### 2.2. Bağımlılık Yönü

- **Bağımlı olduğu**:
  - **API Layer**: Sadece HTTP üzerinden; UI, Application veya Domain’i doğrudan referans almaz.
- **Bağımlı olduğu şeyler hakkında bilmediği**:
  - DB şeması, EF Core, runner implementasyonu, queue altyapısı, rule engine detayları.

### 2.3. Public Interface’ler

- **Dış dünyaya**:
  - Kullanıcı ile etkileşim (web tarayıcı).
- **Diğer katmanlara doğru**:
  - **REST çağrıları**:
    - Auth: `/api/auth/login`, `/api/auth/refresh`, vb.
    - Audit management: `/api/audits`, `/api/audits/{id}`, `/api/audits/{id}/summary`, `/api/audits/{id}/findings`, `/api/audits/{id}/gaps`.
    - Target & credential management: `/api/targets`, `/api/credentials`, vb.
    - Reporting & exports: `/api/reports/...`.
  - UI içinde **Application/Domain objeleri yoktur**; yalnızca DTO’lar/JSON kullanır.

---

## 3. API Layer (REST – .NET Controllers)

### 3.1. Sorumluluklar

- HTTP sınırı: istek/yanıt modelini yönetmek.
- AuthN/AuthZ:
  - JWT token doğrulama.
  - Role / permission check (ör. `CanStartScan`, `CanViewFindings`, `CanManageRulePacks`).
- Request/response mapping:
  - JSON body, query string, route param → Application katmanındaki command/query modellerine map.
  - Application result’larını → HTTP status code + DTO şeklinde dışarı verme.
- Input validation (temel seviye):
  - Model binding ve basit doğrulamalar (zorunlu alan, string uzunluğu, format kontrolü).
- Idempotency, pagination, filtering, sorting gibi **API kontratı ile ilgili** detaylar.

### 3.2. Bağımlılık Yönü

- **Bağımlı olduğu**:
  - **Application Layer**: Use case servisleri (command / query handler’lar).
  - Cross-cutting altyapı (logging, metrics) – genellikle DI üzerinden.
- **Bağımlı olmadığı**:
  - DB teknolojisi (EF Core Npgsql gibi implementasyonlar direkt kullanılmaz).
  - Node/Playwright runner detayları.
  - Queue/cron/scheduler detayları (bunları Application abstraction’ları üzerinden çağırır).

### 3.3. Public Interface’ler

- **Dış dünyaya**:
  - REST endpoint’leri (public HTTP kontratı). Örnek gruplar:
    - `AuthController` – login/refresh/logout.
    - `AuditsController` – create/list/detail/summary/findings/gaps.
    - `TargetsController` – target CRUD, scan profiles.
    - `RulePacksController` – rule pack list/assign.
    - `ReportsController` – export (PDF/CSV) ve high-level summary API’leri.
- **Application katmanına**:
  - Use case’leri çağıran **Application Service / Handler** arayüzleri:
    - `ICreateAuditRunUseCase`, `IGetAuditRunSummaryQuery`, `IGetFindingsQuery`, vb.

---

## 4. Application Layer (Use Cases)

### 4.1. Sorumluluklar

- **İş akışlarının koordinasyonu**:
  - Tek bir use case içinde birden fazla Domain nesnesi ve Infrastructure port’unun orkestrasyonu.
- **Use case tanımı**:
  - “Yeni audit başlat”, “audit sonuçlarını getir”, “finding status güncelle”, “scheduled scan oluştur”, “rule pack ata” gibi **iş açısından anlamlı** işlemler.
- **Transaction boundary**:
  - Gerekli olduğunda transaction açma/commit/rollback kararlarını verme (genellikle infra abstraction üzerinden).
- **Policy enforcement (uygulama seviyesi)**:
  - Domain politikalarına ek olarak, “organizational policy” (ör. bir org en fazla N concurrent scan başlatabilir) gibi kurallar.

### 4.2. Bağımlılık Yönü

- **Bağımlı olduğu**:
  - **Domain Layer**: Entities, Value Objects, Domain Services, domain-based policies.
  - **Infrastructure abstraction’ları (port’lar)**:
    - `IAuditRunRepository`, `IFindingsRepository`, `ITargetRepository`, `ICredentialStore`.
    - `IRunnerClient` (Node/Playwright runner ile konuşan port).
    - `IScanQueue` / `IScheduler` (queue & scheduling abstraction’ları).
    - `IRuleEngine` (evidence → findings mapping port’u).
- Bu abstraction’ların **implementasyonları** Infrastructure katmanındadır; Application bunları bilmez.

### 4.3. Public Interface’ler

- **API Layer’a**:
  - Use case seviyesinde **command / query** servisleri:
    - Komutlar:
      - `CreateAuditRunCommandHandler`
      - `ScheduleRecurringScanCommandHandler`
      - `UpdateFindingStatusCommandHandler`
      - `AssignRulePackToTargetCommandHandler`
    - Sorgular:
      - `GetAuditRunDetailQueryHandler`
      - `GetAuditRunSummaryQueryHandler`
      - `GetFindingsByFilterQueryHandler`
      - `GetRiskDashboardQueryHandler`
- **Infrastructure’a doğru**:
  - Port (interface) tanımları:
    - Repository port’ları (DB erişimi).
    - Runner & queue port’ları.
    - Harici entegrasyon port’ları (Jira, Slack, e-posta).
    - Rule engine port’u.

---

## 5. Domain Layer (Entities, Value Objects, Policies)

### 5.1. Sorumluluklar

- İş kurallarının **kalbi**:
  - Kurumsal kavramların tanımı ve kuralları.
- **Domain model**:
  - Varlıklar:
    - `Organization`, `Project`, `Target` (site/app), `ScanProfile`, `Credential`.
    - `AuditRun`, `AuditRunStatus`, `AuditRunMetrics`.
    - `Finding`, `FindingStatus`, `Severity`, `Rule`, `RulePack`.
    - `Gap`, `UiElement`, `EvidenceRef`.
  - Value objects:
    - `Url`, `Email`, `ScanLimits`, `RiskScore`, `TimeWindow`, vb.
  - Domain services / policies:
    - Severity hesaplama, risk score üretimi.
    - Scan scheduling policy (ör. overlap önleme, max concurrency per target).
    - Finding lifecycle (open → fixed / accepted / ignored).
- Yan etkisiz / saf kurallar:
  - DB, HTTP, Playwright, queue gibi detaylardan **habersiz** çalışır.

### 5.2. Bağımlılık Yönü

- **Hiçbir dış katmana bağımlı değildir**.
- Sadece:
  - .NET / dilin temel kütüphaneleri.
  - Kendi modelleri ve yardımcıları.

### 5.3. Public Interface’ler

- **Application’a**:
  - Domain sınıfları ve domain servisleri:
    - Ör. `AuditRun.Start()`, `AuditRun.MarkCompleted()`, `Finding.MarkAsAccepted()`.
    - Domain service’ler: `RiskScoringService`, `ScanSchedulingPolicy`.
- **Infrastructure’a**:
  - Domain tarafından tanımlanan interface’ler (örn. domain-driven approach’ta bazı portlar burada da tanımlanabilir):
    - Ör. `IRuleDefinitionProvider` (rule’ların domain-temelli tanımı).

---

## 6. Infrastructure Layer (DB, Runner, Playwright, Queue, Integrations)

### 6.1. Sorumluluklar

- **Teknoloji detaylarının** gerçekleştirildiği katman:
  - Veri erişimi:
    - EF Core + Npgsql ile PostgreSQL repository implementasyonları.
    - Migration’lar, DB connection management, transaction implementasyonları.
  - Runner entegrasyonu:
    - Node/Playwright tabanlı runner’ı çağıran `RunnerClient`:
      - CLI invocation, config dosyaları, JSON output toplama.
      - Timeout, retry, error handling.
  - Queue & scheduler:
    - DB-based job queue, mesajlaşma sistemi (ileride RabbitMQ / SQS vb.).
    - Arka plan worker servisleri (audit runner background service).
  - Rule engine implementasyonu:
    - Evidence (HTTP/DOM/log) → Findings map eden motorun gerçek kodu.
  - Harici entegrasyonlar:
    - Jira, Slack/Teams, e-posta gateway, Prometheus/Grafana exporter’ları vb.
- Teknik cross-cutting concerns:
  - Logging, tracing, metrics exporter’lar (Serilog, OpenTelemetry implementasyonları).

### 6.2. Bağımlılık Yönü

- **Bağımlı olduğu**:
  - Application ve Domain katmanında tanımlı abstraction/port’lar:
    - Interface’leri implement eder.
- **Bağımlı olmadığı**:
  - UI (Presentation) – Infrastructure, UI ile doğrudan konuşmaz.
- **Dış teknolojilere bağımlı**:
  - PostgreSQL, Node/Playwright, queue sistemi, e-posta/Jira API’leri vb.

### 6.3. Public Interface’ler

- **Application’a**:
  - Interface implementasyonları:
    - `EfCoreAuditRunRepository : IAuditRunRepository`
    - `PostgresScanQueue : IScanQueue`
    - `PlaywrightRunnerClient : IRunnerClient`
    - `DefaultRuleEngine : IRuleEngine`
    - `JiraIssuePublisher : IFindingNotificationSink`, vb.
- **Dış dünyaya**:
  - DB, queue, runner process’leri, entegrasyon API’leri ile kurduğu bağlantılar (ancak bu, sistem dışındaki bileşenler için şeffaftır; sistem içinde Application/Domain port’ları üzerinden soyutlanır).

---

## 7. Cross-Cutting Concerns

- **Security**:
  - AuthN/AuthZ (API’de uygulanır, domain policy ile desteklenir).
  - Credential encryption & secret management (Infrastructure).
- **Logging & Observability**:
  - Request/response logging (API).
  - Use case ve domain event log’ları (Application/Domain).
  - Metrics & tracing (Infrastructure implementasyonları).
- **Configuration**:
  - Scan profiles, rule pack selection, org-level policy’ler.

---

## 8. Mevcut Repository Yapısı ile Eşleşme

- `frontend/` → **Presentation**.
- `backend/KamuAudit.Api/Controllers` → **API**.
- `backend/KamuAudit.Api/Application/...` → **Application** (use case servisleri, handler’lar).
- `backend/KamuAudit.Api/Domain/...` → **Domain** (entities, policies).
- `backend/KamuAudit.Api/Infrastructure/...` → **Infrastructure** (DB, runner, background services, integrations).
- `runner/` → Infrastructure içindeki **Runner implementasyonu** ve kısmen **Rule engine / evidence collector** kodu (Application/Domain’de tanımlanan port’lara göre yeniden düzenlenecektir).

Bu layered mimari, gelecekte **rule engine’in ayrı bir servis olarak ayrılması**, **birden fazla runner tipi** eklenmesi veya **DB/queue teknolojilerinin değiştirilmesi** gibi evrimleri desteklerken, domain kurallarının ve use case’lerin stabil kalmasını hedefler.


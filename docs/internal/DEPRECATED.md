## Kamu Web Audit – Deprecated Dokümanlar

Last updated: 2026-03-05

Bu dosya, **artık aktif olarak güncellenmeyen** ve günlük geliştirme / bakım
akışında kullanılmaması gereken dokümanları listeler. Bunlar çoğunlukla
ilk mimari incelemeler, eski planlar veya ayrıntılı QA raporlarıdır.

Silinmeleri ürünün çalışmasını etkilemez; sadece tarihsel referans olarak
saklanmaktadır.

---

### 1. Mimari / Uygulama Planları

- `docs/architecture/IMPLEMENTATION_PLAN.md`
- `docs/architecture/IMPLEMENTATION_PLAN_EN.md`

Yerine kullanılanlar:

- `docs/architecture/ARCHITECTURE.md`
- `docs/internal/ARCHITECTURE.md`
- `docs/ci/CI.md`

---

### 2. Dağıtım ve Runbook Dokümanları

- `docs/deployment/RUNBOOK_DEPLOYMENT.md`
- `docs/deployment/RUNBOOK_DEPLOYMENT_EN.md`
- `docs/deployment/DEPLOYMENT_CHECKLIST.md`
- `docs/deployment/DEPLOYMENT_CHECKLIST_EN.md`

Yerine kullanılanlar:

- Public özet: `docs/public/DEPLOYMENT_OVERVIEW_TR.md`
- CI ve temel operasyon: `docs/ci/CI.md`, `docs/ops/OBSERVABILITY.md`

---

### 3. Eski Observability ve Performans Dokümanları

- `docs/operations/OBSERVABILITY_GUIDE.md`
- `docs/operations/OBSERVABILITY_GUIDE_EN.md`
- `docs/performance/INDEX_RECOMMENDATIONS.md`
- `docs/performance/INDEX_RECOMMENDATIONS_EN.md`

Yerine kullanılanlar:

- Observability: `docs/ops/OBSERVABILITY.md`

---

### 4. Eski Test ve UI Coverage Dokümanları

- `docs/testing/TEST_AUDIT_PLAN.md`
- `docs/testing/TEST_AUDIT_PLAN_EN.md`
- `docs/testing/REGRESSION_CHECKLIST.md`
- `docs/testing/REPORT_SCHEMA_EXAMPLE.md`
- `docs/testing/VISIBILITY_AND_SCROLL.md`

Yerine kullanılanlar:

- Genel strateji: `docs/qa/TEST_STRATEGY.md`
- Runner test yapısı: `runner/src/tests/*.spec.ts`

---

### 5. Eski TR Index ve Giriş Noktaları

Bunlar yeni dokümantasyon index’i ile **yerine geçilmiş** duruma geldi:

- `docs/internal/deprecated/README_TR.md`
- `docs/internal/deprecated/INDEX_TR.md`

Yerine kullanılanlar:

- Genel index: `docs/README.md`
- İç mimari özeti: `docs/internal/ARCHITECTURE.md`
- API özeti: `docs/internal/API.md`
- QA özeti: `docs/internal/QA.md`

---

### 6. ADR Kopyaları

- `docs/architecture/adr/0002-auth-cookie-vs-localstorage.md`

Canonical / güncel konum:

- `docs/internal/adr/0002-auth-cookie-vs-localstorage.md`

Gelecekte temizlik yapılırken, **deprecated** listesinde olan bu dosyalar
gönül rahatlığıyla kaldırılabilir. Güncel dokümantasyon için her zaman
`docs/README.md` ve `docs/internal/*.md` altındaki index’leri kullanın.


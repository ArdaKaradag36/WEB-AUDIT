## UI Coverage & Gaps Rapor Şeması – Özet (TR)

> Orijinal İngilizce belge: `../../runner/docs/REPORT_SCHEMA_EXAMPLE.md`.

Bu doküman, runner’ın ürettiği **`ui-inventory.json`** ve **`gaps.json`** dosyalarındaki alanları açıklar.

### `ui-inventory.json` – Element düzeyi alanlar

Her `elements[]` girdisi için tipik alanlar:

- `elementId` – benzersiz ID (örn. `el-0-button-0`)
- `type` / `tagName` – HTML türü (`button`, `a`, …)
- `humanName` – görünen label/metin.
- `pageUrl` – bulunduğu sayfa URL’si.
- `visible`, `enabled` – temel durum bayrakları.
- `recommendedSelectors` – rol/label/css tabanlı önerilen seçiciler.
- `tested` – en az bir deneme yapılıp yapılmadığı.
- `status` – `TESTED_SUCCESS` / `SKIPPED` / `ATTEMPTED_FAILED` / `ATTEMPTED_NO_EFFECT`.
- `reasonCode` – test edilmemiş veya başarısız durumlar için sebep kodu.
- `actionHint`, `confidence`, `fixSuggestion` – ürün düzeyi açıklamalar.
- `evidence` – seçici adedi, exception mesajı vb. ek veri.
- `riskLevel` – `safe`, `needs_allowlist`, `destructive`, `requires_auth` gibi risk sınıfları.
- `attempts[]` – her tıklama/doldurma denemesinin detayları.

### `summary.json` → `uiCoverage` bölümü

Toplam ve dağılım bilgileri:

- `totalElements`, `testedElements`, `skippedElements`, `failedElements`.
- `byStatus`, `byReasonCode`, `topSkipReasons`, `topReasonCodes`.
- `topActionableItems` – en önemli aksiyon gerektiren öğeler.
- `actionableGaps` – toplam aksiyon alınabilir boşluk sayısı.

### `gaps.json` – Gap kayıtları

Her gap:

- `elementId`, `type`, `humanName`, `pageUrl`
- `status`, `reasonCode`, `actionHint`, `confidence`, `fixSuggestion`
- `evidence`
- `recommendedSelectors`, `recommendedScript`
- `riskLevel`

Bu şema; backend ingest katmanının DB alanları ile doğrudan eşleşmesi için tasarlanmıştır (`findings` ve `gaps` tabloları). Tüm örnek JSON ve ayrıntılar için İngilizce dokümana bakınız: `../../runner/docs/REPORT_SCHEMA_EXAMPLE.md`.


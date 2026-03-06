# Kamu Web Audit Runner Tests – Beklenen Davranış Notları

Bu dosya, bazı çekirdek testlerin **beklenen davranışını** kısa notlarla kayıt altına alır.

## jsAnalyzer.spec

- `detects potential secret-like patterns in HTML`:
  - Inline HTML/JS içinde API key benzeri pattern’ler (örn. `API_KEY = "apikey=ABCDEFGH1234567890"`) tespit edilmeli.
  - Beklenen bulgu: `ruleId = "KWA-JS-001"`, `confidence <= 0.6` (heuristic, yüksek recall, düşük kesinlik).

## formAnalyzer.spec

- `analyzeForms detects reflected and encoded payload heuristically`:
  - Basit bir GET formu (action `/search`) bulunur.
  - Formdan gönderilen zararsız payload (`SAFE_REFLECTION_PAYLOAD`) response’ta **HTML encoded** olarak yansıyorsa:
    - En azından `<` karakterleri encode edildiği senaryoda `KWA-FORM-002` üretilir (reflection surface + encoding var).
  - Ayrıca sayfadaki form envanteri için `KWA-FORM-010` info-level bulgusu beklenir.

## urlNormalizer.spec

- `canonicalizeUrl strips tracking parameters and sorts others`:
  - URL’lerde `utm_*`, `gclid`, `fbclid` vb. tracking parametreleri **tamamen kaldırılmalı**.
  - Kalan query parametreleri alfabetik sıraya göre normalize edilir.
  - Örnek:  
    - Girdi: `https://example.com/page?utm_source=x&b=2&a=1&gclid=foo`  
    - Çıktı: `https://example.com/page?a=1&b=2`


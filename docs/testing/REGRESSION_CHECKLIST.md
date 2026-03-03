## Regresyon Checklist – Visibility & Scroll (TR Özet)

> Orijinal İngilizce belge: `../../runner/docs/REGRESSION_CHECKLIST.md`.

Bu checklist, otomatik UI denetiminin **görünürlük sınıflandırması** ve **scroll sampling** davranışının beklenen şekilde çalıştığını doğrulamak için kullanılır.

- **Görünürlük sınıfları**:
  - `NOT_VISIBLE` – element gizli veya fiziksel kutusu yok.
  - `OUT_OF_VIEWPORT_SCROLL_REQUIRED` – kutu var, gizli değil ama viewport dışında.
  - `TIMEOUT` – beklenen halde görünür olması gerekirken zamanında hazır olamayanlar.
- **Beklenen eğilimler**:
  - Eski sürüme göre `NOT_VISIBLE` sayısı azalmalı.
  - Uzun sayfalarda `OUT_OF_VIEWPORT_SCROLL_REQUIRED` sayısı artmalı.
  - `TIMEOUT` sayısı azalmalı.
- **Coverage**:
  - `TESTED_SUCCESS` ve en az bir attempt’i olan eleman sayısı artmalı.
  - `summary.byStatus` ve `summary.byReasonCode` envanterle tutarlı olmalı.
- **Nedensellik & kanıt**:
  - `tested=false` olan hiçbir element `reasonCode`’suz kalmamalı.
  - `NOT_VISIBLE`, `OUT_OF_VIEWPORT_SCROLL_REQUIRED`, `TIMEOUT` gibi durumlar için `evidence` alanı dolu olmalı.

Detaylı adımlar ve komutlar için İngilizce dokümana başvurabilirsiniz: `../../runner/docs/REGRESSION_CHECKLIST.md`.


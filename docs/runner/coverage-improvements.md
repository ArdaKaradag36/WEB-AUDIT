# Runner Kapsamı (Coverage) — Teknik Not

Bu doküman, runner’ın “ne kadar yüzeyi gördüğünü” ve UI otomasyon sinyalinin nasıl yorumlanması gerektiğini açıklar. Kurumsal kullanımda metriklerin yanlış anlaşılmasını önlemek hedeflenir.

## Metrikler

- **UI automation**: keşfedilen adaylar içinde otomatik denemede “başarılı etkileşim” sayısı
- **Summary score**: bulgu şiddeti ağırlıklı bir özet; UI automation düşükse “tamamlanma” gibi yorumlanmamalıdır

## Sınırlar (beklenen)

UI otomasyon metrikleri şu alanları garanti etmez:

- İş kuralı doğruluğu ve yetkilendirme matrisi
- Sunucu tarafı mantık hataları
- Login sonrası karmaşık kullanıcı akışları (özel spec/senaryo gerekir)

## Pratik öneriler

- Kurumsal site denetimlerinde crawl budget’ı ve UI attempt sınırını artırın.
- Aksiyon allowlist’i kullanarak güvenli şekilde daha fazla UI yüzeyi test edin.

---

# Runner Coverage — Technical Note

This document explains what runner coverage represents and how to interpret UI automation signals in an enterprise setting.

## Metrics

- **UI automation**: number of “successful interactions” among discovered candidates
- **Summary score**: severity-weighted summary; low UI automation must not be interpreted as “completion”

## Expected limits

UI automation metrics do not guarantee:

- Business logic correctness or authorization matrix validity
- Server-side logic flaws
- Complex post-login flows (require explicit specs/scenarios)

## Practical recommendations

- Increase crawl budget and UI attempt limits for enterprise sites.
- Use a click allowlist to safely exercise more UI surface area.

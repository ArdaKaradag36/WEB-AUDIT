# Penetrasyon Testi — Runbook

Bu runbook, WEB-AUDIT’in kendisi ve/veya WEB-AUDIT ile hedeflenen sistemler için penetrasyon testi yürütürken izlenecek güvenli operasyon adımlarını tanımlar.

## Kapsam ve izin

- Yalnızca yazılı onaylı hedefler (scope) test edilir.
- Gerekirse hedef allowlist yaklaşımı uygulanır (prod dışında başlatmak önerilir).
- Trafik limitleri ve test penceresi önceden planlanır.

## Kayıt ve kanıt

- Çıktılar: `summary.json` ve gerekiyorsa `sarif` özeti
- Hassas veri/PII riski için artefakt paylaşımı kontrollü yapılır.

## Süreç

1. Scope + onay + iletişim kanalı
2. Test planı (otomasyon + manuel doğrulama)
3. Bulguların sınıflandırılması ve doğrulaması
4. Ticket/aksiyon planı + retest tarihi

---

# Penetration Testing — Runbook

This runbook defines safe operational steps for running penetration tests of WEB-AUDIT itself and/or target systems assessed using WEB-AUDIT.

## Scope and authorization

- Only explicitly approved targets are tested.
- If needed, use an allowlist approach (prefer non-production execution).
- Rate limits and testing windows must be planned in advance.

## Records and evidence

- Outputs: `summary.json` and, when required, `sarif` summary
- Artifact sharing must be controlled due to sensitive data/PII risk.

## Process

1. Scope + approval + communication channel
2. Test plan (automation + manual validation)
3. Finding classification and verification
4. Tickets/action plan + retest date

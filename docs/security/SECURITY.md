⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Güvenlik Politikası – Özet (TR)

> Ayrıntılı İngilizce sürüm: `SECURITY_EN.md`.

Bu doküman; bağımlılık güvenliği ve güvenlik açıklarına nasıl tepki verileceğini özetler.

### 1. Otomatik Bağımlılık Taraması

- **Dependabot (`.github/dependabot.yml`)**
  - **nuget**: `backend/**` altındaki NuGet paketlerini haftalık tarar ve güncelleme PR’ları açar.
  - **npm**: `runner/**` altındaki npm paketlerini haftalık tarar ve güncelleme PR’ları açar.

- **Security Audit workflow (`.github/workflows/security-audit.yml`)**
  - **.NET job**:
    - `dotnet restore` ve ardından:
    - `dotnet list package --vulnerable --include-transitive`
  - **Node job**:
    - `npm ci`
    - `npm audit --audit-level=high`
  - Her iki job da `continue-on-error: true` ile çalışır; pipeline’ı kırmadan loglara çıktı üretir.

### 2. Uyarılara Tepki

- **Triage**
  - Raporlanan zafiyetlerin şiddetini ve ulaşılabilirliğini inceleyin.
  - Paket gerçekten runtime’da kullanılıyor mu, yoksa sadece devDependency mi?

- **Düzeltme (.NET)**
  - Dependabot PR’larını kullanın veya ilgili `.csproj` içinde paket sürümünü güncelleyin.
  - Ardından: `dotnet restore`, `dotnet build`, `dotnet test`, `dotnet list package --vulnerable`.

- **Düzeltme (Node)**
  - `npm audit` çıktısını inceleyin.
  - Uygun ise `npm audit fix --audit-level=high` veya elle `package.json` güncellemesi + `npm ci`, `npm test`, `npm run build`, `npm run lint`.

### 3. Önerilen SLA’ler

- Kritik: 24 saat içinde inceleme, 3 gün içinde düzeltme/mitigasyon.
- Yüksek: 3 gün içinde inceleme, 7 gün içinde düzeltme.
- Orta: 7 gün içinde inceleme, 30 gün içinde düzeltme.
- Düşük: Bakım dönemlerinde ele alınır.

### 4. Güvenlik Açıklarının Bildirilmesi

- Kamuya açık GitHub issue yerine, kurum içi güvenlik kanalı (örn. security@...) üzerinden bildirin.
- Şu bilgileri ekleyin:
  - Sorunun açıklaması ve etkisi
  - Tekrar üretim adımları
  - Önerilen çözüm veya mitigasyonlar (varsa)

Detaylar ve örnek komutlar için İngilizce dokümana bakınız: `SECURITY_EN.md`.


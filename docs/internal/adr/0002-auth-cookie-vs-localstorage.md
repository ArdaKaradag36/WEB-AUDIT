# ADR 0002 – Auth Cookie vs LocalStorage

Last updated: 2026-03-05

- Tarih: 2026-03-05
- Durum: Proposed
- İlgili bileşenler: Frontend, Auth API, Gateway / Reverse Proxy

---

## 1. Context

Kamu Web Audit’in ilk sürümünde frontend, backend ile **JWT Bearer token** üzerinden konuşmaktadır:

- Kullanıcı `/api/Auth/login` çağrısı ile bir JWT alır.
- UI, bu token’ı **Authorization: Bearer** header’ı ile sonraki çağrılarda kullanır.

Bu modelde tipik implementasyonlar:

- Token’ın **localStorage** içinde tutulması (en yaygın SPA yaklaşımı),
- Veya token’ın **HttpOnly cookie** içinde tutulması (session-cookie benzeri).

Güvenlik ve operasyon açısından:

- XSS, CSRF, SSO entegrasyonları, çoklu frontend domain’leri ve gateway’ler gibi faktörler,
  hangi yaklaşımın tercih edileceğini doğrudan etkiler.

Bu ADR, Kamu Web Audit için **localStorage yerine HttpOnly cookie tabanlı** bir yaklaşımı
tercih etmemizin nedenlerini açıklar.

---

## 2. Decision

1. **Access token saklama yeri**:
   - **Karar**: Access token’lar **HttpOnly + Secure + SameSite** cookie’lerinde tutulacaktır.
   - Token, frontend JS kodu tarafından **okunamaz** olmalıdır.

2. **Refresh token stratejisi**:
   - Refresh token’lar:
     - Daha uzun ömürlü,
     - Sadece backend tarafından doğrulanan,
     - HttpOnly cookie veya server-side session store ile yönetilecek.

3. **API çağrıları**:
   - Frontend, normal fetch/axios çağrıları yapar; JWT token:
     - Browser tarafından otomatik olarak cookie ile gönderilir (SameSite kurallarına uygun olarak),
     - Backend tarafında standart `Cookie` header’ı üzerinden okunup doğrulanır.

4. **Transition**:
   - Mevcut Bearer header modeli, ilk aşamada **desteklenmeye devam eder** (backward compatibility).
   - Yeni cookie tabanlı model:
     - Auth controller’ında ek endpoint veya response modeliyle kademeli olarak devreye alınır
       (örn. `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax`).

---

## 3. Rationale (Neden HttpOnly cookie, neden localStorage değil?)

### 3.1. XSS Riskini Azaltma

- LocalStorage:
  - XSS durumunda, saldırgan JS kodu **doğrudan token’a erişebilir** (`localStorage.getItem("token")`).
  - Bu da session hijacking’i kolaylaştırır.
- HttpOnly cookie:
  - JS, cookie içeriğini göremez (`document.cookie` ile okunamaz).
  - XSS hâlâ bir problemdir (örneğin DOM manipülasyonu), ancak token **kolayca dışarı sızdırılamaz**.

Bu nedenle, XSS’nin tamamen engellenemeyeceği varsayımıyla, token’ın JS’ten gizlenmesi tercih edilir.

### 3.2. CSRF ve SameSite Politikaları

- Cookie tabanlı yaklaşımda:
  - `SameSite=Lax` veya `SameSite=Strict` ile:
    - Üçüncü taraf sitelerden gelen isteklerde cookie otomatik gönderilmez (veya kısıtlı gönderilir).
  - `SameSite=None; Secure` kombinasyonu gerektiğinde (örneğin farklı domain’ler üzerinden SSO),
    klasik **CSRF token** mekanizması ile desteklenmelidir.
- LocalStorage + Authorization header’ı:
  - CSRF’ye dayanıklı olsa da:
    - Token’ın JS içinde tutulması XSS riskini artırır.

Bu projede:

- UI ve API çoğunlukla aynı origin altında çalışacağı varsayımıyla:
  - `SameSite=Lax` veya `SameSite=Strict` çoğu senaryoyu karşılar.
  - Cross-origin senaryolarda yönlendirici/gateway tasarımı ayrıca ele alınacaktır.

### 3.3. Operasyonel Basitlik

- HttpOnly cookie:
  - Reverse proxy / WAF / gateway seviyesinde:
    - Standardize loglama ve oturum yönetimi sağlar.
  - Token yenileme (refresh) logic’i:
    - Tek bir `refresh` endpoint’i ve cookie güncellemesi ile yönetilebilir.
- LocalStorage:
  - Her frontend uygulamasının token yenileme ve saklama logic’ini içermesi gerekir.
  - Birden fazla frontend (örn. admin UI + public dashboard) olduğunda karmaşıklık artar.

---

## 4. Alternatives Considered

### 4.1. Sadece LocalStorage (Bearer Header)

- Avantajlar:
  - Basit SPA implementasyonu,
  - CSRF’ye karşı doğal koruma (cookie yok, header var).
- Dezavantajlar:
  - XSS durumunda token’ın çalınması çok kolay.
  - Browser/extension tarafında daha fazla saldırı yüzeyi.

Bu nedenle, özellikle **kamu kurumlarına ait siteler** üzerinde çalışan bir ürün için
uzun vadeli çözüm olarak uygun değildir.

### 4.2. Mixed Model (Cookie + LocalStorage)

- Access token cookie’de, bazı claim’ler veya kısa ömürlü bir “UI token” localStorage’da tutulabilir.
- Bu karmaşıklaştırır ve yanlış kullanım riskini artırır; bu nedenle **şimdilik** tercih edilmez.

---

## 5. Consequences

### 5.1. Positive

- XSS sonrası token exfiltration riski azalır.
- Reverse proxy / WAF entegrasyonlarında daha standart bir yapı.
- Çoklu frontend’ler için ortak oturum yönetimi kolaylaşır.

### 5.2. Negative / Trade-offs

- CSRF tehdidini yönetmek için:
  - SameSite politikaları ve/veya CSRF token’ı gerekir.
- Bazı cross-origin senaryolarında:
  - CORS + cookie ayarları dikkatle yapılandırılmalıdır.

---

## 6. Follow-Up Actions

1. Auth controller’ında:
   - Login yanıtına `Set-Cookie` ile HttpOnly access token eklenmesi.
2. Frontend’de:
   - LocalStorage yerine cookie tabanlı oturum yönetimi için HTTP-only modele geçiş.
3. Ek ADR’ler:
   - `0003-auth-refresh-token-rotation`
   - `0004-session-timeouts-and-idle-timeout`


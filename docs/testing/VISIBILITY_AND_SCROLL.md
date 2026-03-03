## Görünürlük Sınıflandırması & Scroll Sampling – Özet (TR)

> Orijinal İngilizce belge: `../../runner/docs/VISIBILITY_AND_SCROLL.md`.

Bu doküman, otomatik UI denetim motorunun:

- Her element için **görünürlük durumunu** nasıl belirlediğini,
- Uzun sayfalarda **scroll sampling** ile kapsamanın nasıl arttırıldığını

özetler.

### Görünürlük Sınıfları

Her öğe için üç temel sınıflandırma kullanılır:

- `NOT_VISIBLE` – element DOM’da olsa bile gizli veya geçersiz kutuya sahip (display:none, visibility:hidden, opacity:0, boyut sıfır, vb.).
- `OUT_OF_VIEWPORT_SCROLL_REQUIRED` – element görünür ve gizli değil ancak viewport dışında (sayfanın aşağısında/yukarısında).
- `VISIBLE_IN_VIEWPORT` – element görünür ve viewport içinde; deneme yapılabilir.

Bu sınıflar, `runner/src/auto/visibility.ts` içinde; bounding box, computed style ve viewport bilgisine dayanarak hesaplanır. Her karar için `evidence` alanına kutu, viewport ve stil bayrakları yazılır.

### Scroll Sampling

Uzun sayfalarda, ilk geçişte görünür olmayan öğeler için ek bir **scroll pass** uygulanır:

- Konfigürasyon (`AutoUiAuditConfig`):
  - `scrollSteps` – kaç farklı scroll pozisyonu (örn. 5).
  - `scrollStabilizationMs` – her scroll sonrasında bekleme süresi.
  - `maxAttemptsPerScrollStep` – adım başına denenecek element sayısı üst sınırı.
- Davranış:
  - Sayfa, yükseklik boyunca eşit parçalara bölünerek aşağı kaydırılır.
  - Her adımda, daha önce `NOT_VISIBLE` / `OUT_OF_VIEWPORT_SCROLL_REQUIRED` olarak işaretlenen öğeler tekrar değerlendirilir.
  - Artık viewport içinde olan öğeler için tek bir deneme yapılır (maxAttempts ve bütçe korunur).

Bu mekanizma, scroll tabanlı sayfalarda test edilebilir öğe sayısını artırırken, deterministik kalacak şekilde tasarlanmıştır.

Detaylı fonksiyon tanımları ve örnekler için: `../../runner/docs/VISIBILITY_AND_SCROLL.md`.


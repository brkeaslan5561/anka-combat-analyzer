# Anka Combat Analyzer v1.1.9

Overlay yerleşimi ve farklı ekran çözünürlükleri için görüntü ölçeklendirme seçenekleri eklendi.

## Değişiklikler

- Üst bara yeni `Display` ayar düğmesi eklendi.
- Kullanıcı çözünürlük/UI profili seçebilir: `1280×720`, `1600×900`, `1920×1080`, `2560×1440`, `3840×2160`.
- Seçilen profile göre uygulamanın UI ölçeği otomatik değişir; tablolar, butonlar ve yazılar ekran yoğunluğuna daha uygun görünür.
- Çözünürlük profilinden bağımsız `Text Size` seçeneği eklendi: Small, Normal, Large, Extra Large.
- Overlay boyutu `%80`, `%100`, `%120`, `%140` olarak seçilebilir.
- `Move Overlay` ile timer overlay geçici olarak tıklanabilir hale gelir. Kullanıcı overlay'i ekranda sürükleyip istediği yere bırakabilir ve overlay üzerindeki `Done` düğmesiyle konumu kaydedebilir.
- Overlay konumu sonraki uygulama açılışlarında korunur.
- `Reset Position` overlay'i varsayılan sağ üst konuma geri taşır.
- Kayıtlı overlay konumu ekran değişikliği veya çözünürlük farkında görünür çalışma alanına sınırlandırılır; pencerenin ekran dışında kalması engellenir.
- Display/overlay tercihleri combat analizi ayarlarından ayrı `display-settings.json` içinde tutulur; v1.1.8 combat parser ve updater davranışları değiştirilmez.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.9-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.9-x64.exe`: kurulum gerektirmeyen sürüm.

v1.1.8 kullanan kullanıcılar uygulama içindeki Update kontrolü üzerinden v1.1.9'a geçebilir.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

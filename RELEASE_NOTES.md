# Anka Combat Analyzer v1.1.11

Overlay yaşam döngüsü düzeltildi ve Türkçe / English dil seçimi eklendi.

## Overlay düzeltmeleri

- Ana Combat Analyzer penceresi kapandığında timer overlay artık kesin olarak kapanır.
- Uygulama ana pencere kapatıldığında arka planda process olarak yaşamaya devam etmez.
- Electron single-instance lock eklendi; uygulamayı ikinci kez açmak yeni bir process ve ikinci overlay oluşturmaz.
- İkinci kez çalıştırma denemesinde mevcut ana pencere öne getirilir.
- `Move Overlay` sonrasında iki ayrı overlay oluşmasına yol açan eski process/ikinci instance senaryosu engellendi.
- v1.1.10 ana pencere görünürlük hotfix'i korunur.

## Language / Dil

- Display ayarlarına `Language` seçeneği eklendi: `English` ve `Türkçe`.
- İlk kullanımda Windows dili Türkçeyse uygulama varsayılan olarak Türkçe açılır.
- Windows dili Türkçe değilse varsayılan dil English olur.
- Kullanıcının seçtiği dil kalıcı olarak kaydedilir ve Windows varsayılanını geçersiz kılar.
- Ana arayüz, tablolar, açıklamalar, boş durum mesajları, timer ekranı, update kontrolleri, pencere kontrolleri, Display ayarları ve overlay metinleri Türkçeleştirildi.
- `combatDPS`, `EncDPS`, `DPS`, `combatHPS`, `EncHPS`, Crit, Flank, Deflect ve Neverwinter'a özgü teknik/oyun terimleri çevrilmeden korunur.
- Dil çalışma sırasında değiştirilebilir; uygulamayı yeniden başlatmak gerekmez.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.11-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.11-x64.exe`: kurulum gerektirmeyen sürüm.

v1.1.10 kullanan kullanıcılar uygulama içindeki Update kontrolü üzerinden v1.1.11'e geçebilir.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

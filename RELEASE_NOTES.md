# Anka Combat Analyzer v1.1.10

v1.1.9 sonrasında bazı Windows sistemlerinde uygulama işlemi Görev Yöneticisi'nde çalıştığı halde ana pencerenin görünmemesi için açılış hotfix'i.

## Düzeltmeler

- Ana pencere artık yalnızca Electron `ready-to-show` olayına bağlı kalmıyor.
- Renderer yüklenir yüklenmez ana pencere görünür hale getiriliyor.
- `ready-to-show` gecikir veya hiç oluşmazsa 2.5 saniyelik güvenlik fallback'i ana pencereyi zorla gösteriyor.
- Renderer yükleme hatasında da pencere görünür kalıyor; uygulamanın arka planda görünmeden çalışması engelleniyor.
- Visibility watchdog overlay penceresini ana pencere sanmıyor; timer overlay'in click-through / always-on-top davranışı korunuyor.
- v1.1.9'daki Display ayarları, çözünürlük ve yazı ölçeği, overlay boyutu ve Move Overlay özellikleri korunuyor.
- v1.1.8'deki combatlog/proc parsing düzeltmeleri korunuyor.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.10-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.10-x64.exe`: kurulum gerektirmeyen sürüm.

v1.1.9 kullanan kullanıcıların doğrudan v1.1.10'a geçmesi önerilir.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

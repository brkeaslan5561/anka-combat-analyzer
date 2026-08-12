# Anka Combat Analyzer v1.1.7

Uygulama içi güncelleme sırasında görülen `net::ERR_HTTP2_SERVER_REFUSED_STREAM` hatası düzeltildi.

## Değişiklikler

- Electron ağ katmanı uygulama açılırken HTTP/1.1 uyumluluk moduna alınır; HTTP/2 ve QUIC kapatılır.
- GitHub release kontrolü ve Setup.exe indirmesi artık Chromium HTTP/2 refused-stream hatasına takılmaz.
- Yeni bootstrap giriş noktası uygulama hazır olmadan önce ağ ayarlarını uygular.
- Combat parser, encounter, Breakdown, Timers ve UI davranışlarında değişiklik yapılmadı.
- v1.1.6'daki generic additional/proc damage desteği aynen korunur.

## Önemli: v1.1.6 kullanıcıları

v1.1.6'nın updater'ı bu hatayı içerdiği için v1.1.7'ye geçişte bir kez manuel olarak `Anka-Combat-Analyzer-Setup-1.1.7-x64.exe` dosyasını indirip çalıştırmanız gerekebilir. v1.1.7 kurulduktan sonra sonraki güncellemeler tekrar uygulama içinden yapılabilir.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.7-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.7-x64.exe`: kurulum gerektirmeyen sürüm.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

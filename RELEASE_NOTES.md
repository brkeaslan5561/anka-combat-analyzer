# Anka Combat Analyzer v1.1.2

Encounter yönetimi, log başlangıcı ve boss fail tespiti için düzeltme sürümü.

## Değişiklikler

- Soldaki Encounters listesindeki tekil encounterlar artık silinebilir. Satırın sağındaki `×` kontrolüyle onay vererek listeden kaldırabilirsiniz.
- Seçili encounter silinirse görünüm otomatik olarak `All Encounters`a döner.
- Silinen encounter tercihi aynı log dosyası için hatırlanır; snapshot yenilendiğinde tekrar görünmez.
- `Clear` artık eski log satırlarını yeniden analiz etmez. Clear'a basıldığı an dosyanın sonu başlangıç kabul edilir ve yalnızca bundan sonra gelen combat okunur.
- Yeni bir log dosyası yüklendiğinde tüm geçmiş dosya yerine otomatik olarak en son oyun/zindan oturumu bulunup analiz edilir.
- Son oturum tespiti uzun süreli combat boşluklarını ve çok eski kayıtları dışarıda bırakır; eski zindanların Encounters listesine dolması azaltılır.
- Boss bitişi artık tek başına `Kill` flag'ine bağlı değildir. Bazı bosslarda Kill satırı eksik olsa bile sırf sonraki AOE başladığı için encounter `FAIL` olmaz.
- Aynı boss kısa süre içinde yeniden engage edilirse önceki doğrulanmış boss denemesi otomatik `FAIL` olarak işaretlenir. Böylece wipe/reset ile başarılı bitiş daha güvenli ayrılır.
- Boss Kill flag'i farklı instance bilgisiyle gelse bile stable boss kimliği üzerinden başarı tespiti yapılabilir.
- Boss + add, Kill flagsiz boss bitişi, boss re-engage/fail ve manuel encounter senaryoları için regresyon testleri güncellendi.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.2-x64.exe`: normal Windows kurulumu
- `Anka-Combat-Analyzer-Portable-1.1.2-x64.exe`: kurulum gerektirmeyen sürüm

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

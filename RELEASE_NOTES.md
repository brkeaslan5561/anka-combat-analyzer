# Anka Combat Analyzer v1.1.4

Encounter sistemi sadeleştirildi ve toplam run süresi düzeltildi.

## Değişiklikler

- Otomatik `BOSS` / `AOE` sınıflandırması tamamen kaldırıldı.
- Otomatik boss kill/fail çıkarımı kaldırıldı; `FAIL` yalnızca kullanıcı Fail butonuna bastığında eklenir.
- Otomatik encounterlar artık yalnızca combat akışındaki zaman boşluğuna göre ayrılır. 10 saniyeden uzun yeni hostile boşluk yeni encounter başlatır.
- Encounter adı, o encounter içinde en fazla hasar alan ana hedefin düz adı olarak gösterilir.
- `+ New`, `End` ve `Fail` manuel kontrolleri korunur.
- `All Encounters` süresi artık tek tek combat sürelerinin toplamı değildir. İlk hostile combat eventinden son hostile combat eventine kadar geçen gerçek run süresidir.
- Böylece örneğin 12 dakika süren bir trial, aktif vurulan anlar toplamı 7 dakika olsa bile `All Encounters` bölümünde yaklaşık 12 dakika görünür.
- All Encounters EncDPS hesapları da aynı gerçek run süresini kullanır.
- Boss'a özel `Boss Damage` / `Boss %` arayüzü otomatik boss sınıflandırmasına bağlı olduğu için kaldırıldı.
- Basit encounter ayrımı, Kill flag davranışı, 12 dakikalık run süresi ve manuel encounter davranışı için regresyon testleri eklendi.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.4-x64.exe`: normal Windows kurulumu
- `Anka-Combat-Analyzer-Portable-1.1.4-x64.exe`: kurulum gerektirmeyen sürüm

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

# Anka Combat Analyzer v1.1.0

Encounter yönetimi, log yükleme, güncelleme sistemi ve Windows arayüzü için büyük iyileştirme sürümü.

## Öne çıkanlar

- Son seçilen Neverwinter combat log klasörü artık hatırlanır ve sonraki açılışlarda log otomatik bulunup yüklenir.
- Boss ve AOE encounter ayrımı geliştirildi; boss yanında add/mob dalgaları olsa da ana boss kalıcı hedef davranışıyla algılanabilir.
- Boss öldüğünde boss encounter otomatik kapanır ve sonrasında kalan moblar yeni AOE encounter olarak ayrılır.
- Boss öldürülmeden savaş terk edilip farklı bir dövüşe geçilirse encounter otomatik `FAIL · BOSS` olarak işaretlenir.
- Encounters paneline manuel `+ New`, `End` ve `Fail` kontrolleri eklendi.
- Analiz tablolarındaki sütun başlıklarına sıralama eklendi. Name alfabetik, sayısal sütunlar sayısal olarak artan/azalan sıralanabilir.
- Sağ üstte uygulama sürüm durumu gösterilir: güncelse yeşil `Up to date`, yeni sürüm varsa kırmızı `Not up to date`.
- Yeni sürüm mevcutsa Setup EXE uygulama içinden indirilebilir ve kurulum başlatılabilir.
- Standart Windows başlık çubuğu kaldırıldı; küçültme, büyütme/geri alma ve kapatma kontrolleri doğrudan uygulama üst barına entegre edildi.
- Boss + add, boss fail ve manuel encounter senaryoları için otomatik testler eklendi.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.0-x64.exe`: normal Windows kurulumu
- `Anka-Combat-Analyzer-Portable-1.1.0-x64.exe`: kurulum gerektirmeyen sürüm

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

# Anka Combat Analyzer v1.1.1

Encounter sınıflandırması ve manuel encounter kullanımı için hotfix.

## Düzeltilenler

- Uzun süren AOE savaşlarında tanky/elite mobların yanlışlıkla `BOSS` olarak işaretlenme ihtimali ciddi şekilde azaltıldı.
- Aynı enemy archetype'tan birden fazla instance bulunan savaşlar otomatik boss tespitinde elenir.
- Boss adayının encounter boyunca çok daha kalıcı olması ve diğer moblardan süre/hasar bakımından belirgin biçimde ayrışması gerekir.
- Otomatik boss tespiti artık daha muhafazakâr çalışır; şüpheli durumlar `AOE` olarak bırakılır.
- `+ New` butonuna basıldığında bir sonraki combat beklenmeden anında 0:00 süreli manuel encounter oluşturulur.
- Yeni manuel encounter savaş başlamadan önce `MANUAL · ACTIVE · Waiting for combat` olarak Encounters listesinde görünür.
- Manuel encounter aktifken `+ New` kontrolü yeşil `● Manual Active` durumuna geçer.
- Manuel encounterlar otomatik boss sınıflandırmasına sokulmaz; kullanıcının oluşturduğu sınırlar korunur.
- Boss + add, uzun AOE, tekrarlanan mob archetype'ları, fail ve combatsız manuel encounter senaryoları için regresyon testleri eklendi.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.1-x64.exe`: normal Windows kurulumu
- `Anka-Combat-Analyzer-Portable-1.1.1-x64.exe`: kurulum gerektirmeyen sürüm

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

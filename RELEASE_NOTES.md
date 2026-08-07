# Anka Combat Analyzer v1.1.3

Boss tanıma ve boss damage paylaşımı için güncelleme.

## Değişiklikler

- Hunang gibi yaklaşık 10–15 saniye süren kısa boss savaşları artık yanında add olsa bile otomatik olarak `BOSS` şeklinde tanınabilir.
- Boss tespiti artık yalnızca savaş süresine bağlı değildir; tekil boss archetype'ı, encounter içindeki kalıcılığı, hit payı ve diğer moblara göre hasar üstünlüğü birlikte değerlendirilir.
- Kısa trash pull içindeki sıradan elite mobların boss sayılmaması için baskınlık ve benzersiz archetype kontrolleri korunur.
- Güçlü `Kill` sinyali gelen kısa bosslarda süre eşiği düşürüldü.
- Encounter özetine gerçek boss instance/stable kimliği eklendi; add'li savaşlarda ana boss hedefi güvenilir biçimde saklanır.
- Bir `BOSS` encounter seçildiğinde Encounter Summary tablosunda yeni `Boss Damage` ve `Boss %` sütunları görünür.
- `Boss Damage`, oyuncunun yalnızca ana boss hedefe verdiği hasarı gösterir; add ve diğer mob hasarı dahil edilmez.
- `Boss %`, tüm oyuncuların ana bossa verdiği toplam hasar içindeki oyuncu payını gösterir.
- Pet/companion hasarı normal owner-attribution mantığıyla sahibine dahil edilir.
- Boss damage değerleri tamamlanmış encounterlarda cache'lenir; canlı log güncellemeleri eski boss seçiliyken gereksiz tekrar hesaplama oluşturmaz.
- Kısa boss + iki add ve kısa elite trash pull senaryoları için regresyon testleri eklendi.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.3-x64.exe`: normal Windows kurulumu
- `Anka-Combat-Analyzer-Portable-1.1.3-x64.exe`: kurulum gerektirmeyen sürüm

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

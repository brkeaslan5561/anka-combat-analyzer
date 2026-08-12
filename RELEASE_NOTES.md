# Anka Combat Analyzer v1.1.5

Additional damage proc'larının combat analizinde eksik görünmesi düzeltildi.

## Değişiklikler

- Giant Slayer gibi additional damage proc'ları artık oyuncunun toplam hasarına ve Breakdown bölümüne dahil edilir.
- Hasar algılama yalnızca `Physical` ve `Poison` ile sınırlı değildir; `Arcane`, `Radiant`, `Fire`, `Cold`, `Lightning` ve benzeri gerçek damage effect türleri de desteklenir.
- İleride farklı effect type ile gelen yeni additional-damage proc'larının kaybolmaması için damage sınıflandırması daha genel hale getirildi.
- `owner` alanı boş olup gerçek oyuncu `source` alanında bulunduğunda proc hasarı doğru oyuncuya yazılır.
- `HitPoints`, `Shield`, `Power`, `Soulweave`, `Divinity`, `Hold`, `Root`, `KnockBack`, `KnockUp`, `Disable` gibi heal/resource/control eventleri yanlışlıkla damage olarak sayılmaz.
- Minor Arm Injury filtresi korunur.
- Giant Slayer tarzı proc damage, source attribution ve control/resource ayrımı için regresyon testleri eklendi.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.5-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.5-x64.exe`: kurulum gerektirmeyen sürüm.

Uygulama içindeki güncelleme kontrolü GitHub'daki en güncel release'i kullanır. v1.1.4 kullanan kullanıcılar güncelleme kontrolü yaptığında v1.1.5'i görebilir ve Setup dosyasını indirebilir.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

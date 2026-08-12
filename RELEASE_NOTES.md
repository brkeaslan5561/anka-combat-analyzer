# Anka Combat Analyzer v1.1.6

Additional/proc damage olaylarının encounter ve Breakdown içinde kaybolmasına neden olan Neverwinter combatlog referans çözümleme hatası düzeltildi.

## Değişiklikler

- Neverwinter combatlog'daki `source=*` referansı artık ACT ile aynı şekilde owner'a bağlanır.
- Source alanı tamamen boş olan combat eventlerinde source artık owner olarak çözülür.
- `target=*` referansı artık resolved source'a bağlanır. Böylece proc hasarı `unknown target` olarak kaybolmaz.
- Additional damage artık Giant Slayer adına özel değildir. Aynı combatlog yapısını kullanan overload, enchantment, set bonus, feat, gear proc ve diğer player-owned damage kaynakları genel olarak işlenir.
- Proc damage doğru encounter'a girer ve oyuncunun toplam Damage, DPS, hit istatistikleri ve Breakdown power listesinde görünür.
- v1.1.5'te eklenen genel damage-school desteği korunur; Physical/Poison dışındaki gerçek damage türleri desteklenmeye devam eder.
- ACT kaynak kodundaki gerçek `Doom!` / `target=*` biçimi dahil olmak üzere `target=*`, `source=*` ve blank-source durumları için regresyon testleri eklendi.
- Heal/resource/control eventlerinin damage sayılmaması ve Minor Arm Injury filtresi korunur.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.6-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.6-x64.exe`: kurulum gerektirmeyen sürüm.

Uygulama içindeki güncelleme kontrolü GitHub'daki en güncel release'i kullanır. v1.1.4 ve v1.1.5 kullanan kullanıcılar güncelleme kontrolü yaptığında v1.1.6'yı görebilir ve Setup dosyasını indirebilir.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

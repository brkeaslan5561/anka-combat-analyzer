# Anka Combat Analyzer v1.1.8

Combatlog'daki additional/proc damage satırlarının bazılarının Breakdown ve toplam hasarda görünmemesi düzeltildi.

## Değişiklikler

- Combatlog alanları artık basit `split(",")` yerine CSV kurallarına uygun olarak ayrıştırılır.
- Adında virgül bulunan tırnaklı güç/proc isimleri tek alan olarak doğru okunur.
- Bu düzeltme Giant Slayer'a özel değildir; aynı formatı kullanan tüm mevcut ve gelecekteki additional damage, overload, enchantment, gear proc, feat, set bonus ve benzeri hasar kaynaklarına uygulanır.
- Tırnaklı alanlarda escaped çift tırnaklar da desteklenir.
- Önceki generic damage-school ve implicit source/target düzeltmeleri korunur.

## Gerçek combatlog doğrulaması

Kullanıcıdan alınan gerçek Neverwinter combatlog satırındaki `"Mark of the Giant Slayer, Rank 2"` olayı artık 12 alan olarak doğru parse edilir, oyuncunun toplam hasarına eklenir ve Breakdown'da kendi adıyla görünür.

Ayrıca isimden bağımsız genel regresyon testi olarak `"Additional Proc, Rank 3"` ve escaped quote içeren örnekler de doğrulanır.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.8-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.8-x64.exe`: kurulum gerektirmeyen sürüm.

v1.1.7 kullanan kullanıcılar uygulama içindeki Update butonuyla v1.1.8'e geçebilir.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

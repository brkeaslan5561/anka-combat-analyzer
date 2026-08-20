# Anka Combat Analyzer v1.1.15

Bu sürüm encounter ve tur yönetimini yeniler, seçili encounter analizini ekler ve Neverwinter combat log hesaplamalarındaki çeşitli hataları düzeltir.

## Tur ve encounter gruplama

- Encounter'lar dungeon/trial turlarına göre üst başlıklar altında gruplanır.
- İçerik değiştiğinde veya uzun bir combat arası oluştuğunda yeni tur otomatik olarak başlar.
- Gerektiğinde **New Run** ile manuel olarak yeni tur açılabilir.
- Tur başlıkları altındaki encounter'lar ayrı ayrı görüntülenebilir.

## Silme, seçim ve birleştirme

- Soldan silinen encounter artık **All** toplamına dahil edilmez.
- Kaldırılan encounter'lar gerektiğinde geri yüklenebilir.
- İstenen encounter'lar seçilip **Merge Selected** ile tek bir analiz kapsamı olarak görüntülenebilir.
- Seçili encounter birleşimlerinde süre, DPS, HPS ve diğer istatistikler yalnızca seçilen encounter'lardan hesaplanır.

## Neverwinter hesaplama düzeltmeleri

- Combat dışındaki healing ve resource olaylarının encounter toplamlarını şişirmesi engellendi.
- Sadece görüntü adı sağlayan `ShowPowerDisplayName` satırlarının hasar sayılması engellendi.
- Sıfır büyüklüklü ölüm kayıtları ve shield/mitigation olayları daha doğru yorumlanır.
- Knight's Valor kaynak atfı düzeltildi.
- Healing aktif süresi, DPS aktif süresinden ayrılarak combat HPS hesabı düzeltildi.
- Oyuncu encounter geçmişi seçili analiz kapsamına göre filtrelenir.

## Doğrulama

- Encounter scope ve Neverwinter semantik davranışları için regresyon testleri eklendi.
- Type-check, test, build ve worker smoke kontrolleri çalıştırıldı.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.15-x64.exe`
- `Anka-Combat-Analyzer-Portable-1.1.15-x64.exe`

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk manuel kurulumda “Bilinmeyen yayıncı” uyarısı gösterebilir.

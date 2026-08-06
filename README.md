# Anka Combat Analyzer

Neverwinter `Combatlog.Log` dosyasını geçmişten ve canlı olarak analiz eden Electron masaüstü uygulaması.

## v1.0.0 özellikleri

- İlk herkese açık Windows sürümü
- Anka ve combat analizi temasını birleştiren özel PNG/ICO uygulama ikonu
- Uygulama penceresi, görev çubuğu, kurulum dosyası ve portable sürümde ortak ikon

- ACT tarzındaki yoğun ve kompakt çalışma düzenini koruyan daha sade, dengeli ve modern açık arayüz
- Daha yumuşak panel ayrımları, belirgin seçili durumlar, sade aksiyon düğmeleri ve okunaklı tablo başlıkları
- Combat Analysis, Enemy Powers ve Timers alanlarını ayrı sekme biçimleri ve belirgin aktif durumla toplama
- Üst çalışma alanlarında beyaz aktif sekme, daha belirgin gri pasif sekmeler ve mavi üst vurgu
- Encounter ağacı ile Entity gezginini aynı sade sol panelde gösterme
- Sürüklenerek yüksekliği ayarlanabilen Encounter/Entity ve oyuncu tablo/halka grafik bölmeleri
- Ana Encounter sıralamasını gereksiz grafik olmadan tam yükseklikte gösterme
- Oyuncu güç tablolarının altında hasar paylarını yüzdeleriyle gösteren halka dağılım grafiği
- Güç satırı veya halka dilimi seçildiğinde vuruş saati, hedef/kaynak, hasar tipi, tutar ve bayrakları gösteren ayrıntı paneli
- Hedef ve encounter satırlarında çalışan zaman damgalı hasar drill-down görünümü
- Entity başına 20.000 vuruşa kadar ayrıntı saklama; uzun Gzemnid encounter'larında erken vuruşların kaybolmasını önleme
- Normal pencere boyutunda ekrana sığan öncelikli sütunlar; dar pencerelerde iki yönlü kaydırma desteği
- Oyuncu ayrıntısındaki Damage, Healing, Incoming, Targets, Hits ve Encounters tablolarında çalışan yatay kaydırma çubuğu
- Oyuncu ayrıntısındaki tüm tablo ve vuruş panellerinde sabit, çalışan dikey kaydırma alanı
- Oyuncu güç tablosunda Crit, Flank ve Deflect yüzdelerini birlikte gösterme
- Yalnızca toplam ölüm sayısını gösteren sade Deaths bilgi satırı
- Düşman türüne göre alfabetik gruplanan; yetenekleri, hücre içi ölüm oranını, sade oyuncu adlarını ve son ölüm saatini gösteren görsel Deaths tablosu
- İlk açılışta Entities ve oyuncu halka grafik bölmelerini kompakt biçimde ekranın altında konumlandıran varsayılan yerleşim
- 1050×680 varsayılan ana pencere ve 820×560 minimum pencere boyutu
- Oyunu kapatmayan yarı saydam, tıklamayı engellemeyen timer overlay'i
- Yalnızca gerekli üst eylemler: combatlog yükleme, dışa aktarma, temizleme ve overlay
- Combat Analysis, Enemy Powers ve Timers için ayrı üst seviye çalışma alanları
- Aynı sıralamayı tekrarlayan Damage sekmesi kaldırılmış Encounter, Healing, Tanking, Mitigation, Deaths, Action Points ve Breakdown sekmeleri
- Ana analiz görünümlerini ve oyuncu ayrıntılarını birbirinden ayıran iki sade bağlam çubuğu
- Encounter seçimini ağaç görünümünde toplayan kapsam paneli
- Oyuncu, pet ve düşman filtreleri bulunan aranabilir Entity gezgini
- Entity seçildiğinde ayrı ayrıntı ekranı:
  - Outgoing Damage
  - Outgoing Healing
  - Incoming Damage
  - Incoming Healing
  - Single Target Damage
  - Individual Out Hits
  - Individual In Hits
  - Action Point Details
  - Encounter History
- Ekrana daha rahat sığan, metne yakın genişlikte kompakt oyuncu güç sütunları
- Power sütununun doğal genişlikte tutulmasıyla Damage ve diğer değerleri gereksiz boşluk bırakmadan yan yana gösterme
- Güç bazında Damage, pay, combatDPS, Average, Median, MinHit, MaxHit, Hits, Swings, Hit %, Crit %, Flank %, Flank damage % ve Deflect %
- `combatDPS`: entity'nin kendi aktif saldırı süresine göre hasar/saniye
- `EncDPS`: seçili encounter'ın toplam süresine göre hasar/saniye
- Companion/pet hasarını sahibine birleştiren varsayılan görünüm ve `Split pet damage` seçeneği
- Owner alanı sonraki pet tick'lerinde boş kalsa bile önceden tanınan pet hasarını sahibine aktarma
- `Split pets` görünümünde aynı sahibin aynı görünen kaynağa ait summon instance'larını tek pet satırında toplama
- `Split pets` denetimini Breakdown'ın hemen sağına taşıyan görünür yerleşim
- Yalnızca `Pet_` companion kaynaklarını pet sayma; binek ve oyuncu güç alanlarını sahibine yazma
- Snowtusk, Noble Pegasus ve Eclipsed Lion gibi `Entity_Mount_` kaynaklarını oyuncu hasarı olarak işleme
- Flame Strike ve Daunting Light gibi `Entity_` alan kaynaklarını oyuncunun kendi gücü olarak işleme
- Minor Arm Injury olaylarını hasar ve ham analiz verisinden çıkarma
- Aynı görünen gücün farklı dahili kimliklerini tek satırda birleştirme; Soul Scorch ve Hadar's Grasp yinelenmelerini kaldırma
- Kaymayan, panel yüksekliğine göre küçülen halka grafik ve sabit yüzde listesi
- Oyuncu güç ve hit tablolarında normal pencereye sığan kompakt sütun genişlikleri
- Boss saldırılarını seçip oyunculara ne kadar vurduğunu; oyuncuyu seçip hangi saldırılardan hasar aldığını inceleme
- HitPoints, Shield, Kill, Power, Soulweave ve Divinity log olaylarından healing, mitigation, deaths ve resource istatistikleri
- 20 saniyelik hostile inactivity ile otomatik encounter ayrımı
- Düzenli tekrar eden düşman güçlerinin frekans analizi ve güven puanı
- Kullanıcının düzenleyebildiği düşman gücü zamanlayıcıları ve tıklamayı engellemeyen overlay
- Seçilen log dosyasını 500 ms aralıkla canlı takip
- Analiz verisini JSON olarak kaydetme ve temizleme

Pet ve entity ayrıntıları seçildiğinde worker'dan isteğe bağlı alınır. Böylece büyük loglarda canlı snapshot gereksiz tekil vuruş verilerini sürekli ana pencereye kopyalamaz.

## Geliştirme

```bash
npm install
npm run dev
```

## Test ve gerçek log analizi

```bash
npm test
npm run typecheck
npm run analyze -- "C:\\...\\Combatlog.Log" --player opop
npm run smoke:worker
```

## Windows paketi

En güncel Windows kurulum ve portable sürümleri GitHub Releases sayfasından indirilebilir. Kurulum gerektirmeyen sürüm için `Portable`, normal kurulum için `Setup` dosyası kullanılır.

Windows üzerinde yerel paket oluşturmak için:

```bash
npm install
npm run dist:win
```

Kurulum ve portable çıktılar `release` klasörüne yazılır.

İlk herkese açık sürüm henüz kod imzalama sertifikasıyla imzalanmadığı için Windows SmartScreen ilk çalıştırmada “Bilinmeyen yayıncı” uyarısı gösterebilir. Dosyanın bütünlüğü sürümle birlikte yayımlanan `SHA256SUMS.txt` üzerinden doğrulanabilir.

Oyunda loglamayı başlatmak için sohbet alanına `/combatlog 1`, kapatmak için `/combatlog 0` yazılır.

# Anka Combat Analyzer v1.1.13

Valkariel ve Zulkir gibi aynı trial içinde kısa aralıkla birbirine geçen gerçek boss fazlarının tek encounter altında birleşmesi düzeltildi. Değişiklik diğer dungeon/trial içeriklerini parçalamaması için konservatif korumalarla eklendi.

## Boss phase handoff düzeltmesi

- Normal encounter sistemi hâlâ temel olarak 10 saniyeden uzun hostile combat boşluğuna göre çalışır.
- Buna yalnızca gerçek major/boss hedef geçişleri için dar kapsamlı bir kısa-handoff istisnası eklendi.
- Valkariel -> Zulkir gibi önceki bossun hasar almayı bıraktığı ve birkaç saniye sonra farklı bir gerçek boss hedefinin başladığı durumlarda yeni encounter açılır.
- Önceki hedefin encounter boyunca baskın hedef olması, en az 15 saniyelik encounter geçmişi, yeterli hit sayısı ve en az %45 hedef hasar payı gerekir.
- Önceki major hedef en az 5 saniyedir oyunculardan hasar almıyor olmalıdır.
- Yeni hedefin combatlog archetype bilgisinde boss yapısı bulunmalıdır; normal moblar ve sıradan elite hedefler bu kısa geçiş kuralını tetiklemez.
- Add, minion, summon, clone, illusion, orb, portal, totem, pillar, tentacle, hand, shard ve fragment benzeri yardımcı/mekanik hedefler yeni boss fazı kabul edilmez.
- Aynı görünür boss adına sahip farklı instance/form varyantları aynı faz kimliğini paylaşır. Örneğin Zulkir A/B/C ayrı encounter oluşturmaz.
- Yeni boss benzeri hedef daha önce mevcut encounter içinde görülmüşse kısa-handoff ile tekrar bölünmez.

## Diğer içerikler için regresyon koruması

Test kapsamına özellikle şu senaryolar eklendi:

- Valkariel -> Zulkir: iki ayrı encounter olmalı.
- Zulkir A/B/C: tek encounter kalmalı.
- Boss + normal add: bölünmemeli.
- İç ID'sinde Boss geçen fakat Add/mechanic olan yardımcı hedef: bölünmemeli.
- Önceki boss yeterince uzun/dominant olmadan çıkan başka hedef: bölünmemeli.
- Normal 10 saniyelik encounter gap davranışı değişmemeli.
- 12 dakikalık All Encounters elapsed-time hesabı korunmalı.
- Manuel + New / End / Fail davranışı değişmemeli.

## Önceki düzeltmeler korunur

- v1.1.12'de eklenen virgüllü entity adı parser düzeltmesi (`Valkariel, the Corrupted`) korunur.
- v1.1.12 arka planda otomatik güncelleme sistemi korunur. v1.1.12 kullanan kurulu sürümler v1.1.13'e geçerken update dosyasını Windows Temp alanında indirip sessizce uygulayacaktır.
- Türkçe / English dil seçimi, overlay konumu ve display scaling ayarları korunur.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.13-x64.exe`: normal Windows kurulumu için.
- `Anka-Combat-Analyzer-Portable-1.1.13-x64.exe`: kurulum gerektirmeyen sürüm.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk manuel kurulumda “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

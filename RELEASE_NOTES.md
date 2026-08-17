# Anka Combat Analyzer v1.1.14

M31 trialındaki Valkariel -> Zulkir phase ayrımı gerçek combatlog kimliklerine göre düzeltildi.

## Neden v1.1.13 çalışmadı?

- v1.1.13 testinde Zulkir internal ID'sinin `M31_Trial_Boss_Zulkir_...` biçiminde olduğu varsayılmıştı.
- Gerçek kullanıcı combatlogunda Zulkirler şu kimliklerle geliyor:
  - `M31_Trial_Zulkir_A` — Zulkir Kezaroth (Enlarged)
  - `M31_Trial_Zulkir_B` — Zulkir Baalmede (Enlarged)
  - `M31_Trial_Zulkir_C` — Zulkir Letheras (Enlarged)
- Bu kimliklerde `Boss` kelimesi bulunmadığı için v1.1.13'ün kısa boss-handoff kuralı hiç tetiklenmiyordu.

## v1.1.14 düzeltmesi

- Gerçek `M31_Trial_Zulkir_A/B/C` ailesi M31'e özel tek mantıksal Zulkir fazı olarak tanınır.
- Valkariel fazı bittikten sonra ilk gerçek Zulkir hedefi başladığında yeni encounter açılır.
- Kezaroth, Baalmede ve Letheras farklı görünen adlara sahip olsa da A/B/C aynı Zulkir encounter'ında kalır.
- Normal 10 saniyelik encounter-gap sistemi değiştirilmedi.
- Genel boss algısı diğer dungeon/triallar için gevşetilmedi; bu düzeltme M31'in gerçek kimlikleriyle sınırlıdır.

## Diğer içerikleri koruma

- Gerçek M31 logunda görülen `M31_Trial_Corrupted_Vortex_Ent`, `M31_Trial_Judgement_Beam_Ent`, Env Caster ve benzeri mekanikler yeni boss fazı kabul edilmez.
- Helper/add kontrolü underscore içeren internal ID'lerde de çalışacak şekilde güçlendirildi; örneğin `Trial_Boss_Prime_Add` artık yalnızca display name'e güvenmeden helper olarak tanınır.
- Boss + add, normal 10 saniyelik encounter ayrımı, All Encounters süresi ve manuel New / End / Fail davranışları korunur.

## Regresyon testleri

- Gerçek Valkariel ID'si -> gerçek Zulkir A ID'si iki encounter üretir.
- Zulkir A/B/C farklı display name'lerle tek encounter kalır.
- M31 Corrupted Vortex ve Judgement Beam faz açmaz.
- Internal ID'sinde `_Add` bulunan helper hedef faz açmaz.
- Önceki encounter ve parser testleri korunur.

## Önceki özellikler

- Virgüllü entity isimlerinin parser düzeltmesi korunur.
- Arka planda sessiz update sistemi korunur.
- Türkçe / English, overlay konumu ve display scaling korunur.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.14-x64.exe`
- `Anka-Combat-Analyzer-Portable-1.1.14-x64.exe`

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk manuel kurulumda “Bilinmeyen yayıncı” uyarısı gösterebilir.

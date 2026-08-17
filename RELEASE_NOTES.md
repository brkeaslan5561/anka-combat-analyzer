# Anka Combat Analyzer v1.1.12

Valkariel gibi adında virgül bulunan boss/NPC'lerin combatlog satırlarının kaybolması düzeltildi ve uygulama içi güncelleme süreci arka planda otomatik hale getirildi.

## Combatlog parser düzeltmesi

- Kullanıcıdan alınan gerçek M31 trial combatlogu incelendi.
- Neverwinter bazı entity isimlerini CSV kurallarına uygun biçimde tırnaklamıyor. Örneğin `Valkariel, the Corrupted,C[29 M31_Trial_Boss_Valkariel]` satırındaki isim virgül içerdiği halde quoted değil.
- Eski parser bu satırı 12 yerine 13 alan sanıp tamamen reddediyordu; bu yüzden Valkariel hedef/encounter verilerinde görünmüyordu ve ona verilen hasar kaybolabiliyordu.
- Parser artık entity raw ID yapılarını (`P[...]`, `C[...]`, `*`) kullanarak owner/source/target alanlarını semantik olarak yeniden kuruyor.
- Düzeltme Valkariel adına özel değildir; adında tırnaklanmamış virgül bulunan gelecekteki boss, NPC ve diğer entity'leri de destekler.
- Quoted comma içeren ability/proc isimleri desteği korunur.
- Gerçek `Valkariel, the Corrupted` satırı ve genel `Commander, the Fallen` örneği için regresyon testleri eklendi.

## Arka planda otomatik güncelleme

- v1.1.12'den itibaren uygulama içindeki update düğmesi Setup EXE'yi kullanıcının Downloads klasörüne bırakmaz.
- Güncelleme dosyası Windows temp alanına arka planda indirilir.
- GitHub release asset'i SHA-256 digest sağlıyorsa indirilen dosya kurulmadan önce doğrulanır.
- Kurulu Setup sürümünde güncelleme sessiz NSIS kurulumu ile uygulanır ve Analyzer yeniden açılır.
- Portable sürümde Setup kurulmaz; yeni Portable EXE temp alanına indirilir ve mevcut portable dosya uygulama kapandıktan sonra kendi yerinde değiştirilip yeniden açılır.
- Geçici update dosyaları kullanıcı Downloads klasöründe kalmaz; eski temp dosyaları da temizlenir.
- Teknik olarak yeni sürüm dosyalarının indirilmesi yine gereklidir, ancak indirme/kurulum kullanıcıdan Setup dosyası yönetmesini istemeden arka planda gerçekleşir.

## Geçiş notu

v1.1.11'in updater kodu eski olduğu için `v1.1.11 → v1.1.12` geçişi son kez görünür Setup indirmesi kullanabilir. v1.1.12 kurulduktan sonraki güncellemeler yeni arka plan updater'ını kullanacaktır.

## İndirme

- `Anka-Combat-Analyzer-Setup-1.1.12-x64.exe`: normal Windows kurulumu ve mevcut kurulumların güncellenmesi için önerilen sürüm.
- `Anka-Combat-Analyzer-Portable-1.1.12-x64.exe`: kurulum gerektirmeyen sürüm.

Bu sürüm kod imzalama sertifikasıyla imzalanmamıştır. Windows SmartScreen ilk manuel kurulumda “Bilinmeyen yayıncı” uyarısı gösterebilir. İndirdiğiniz dosyayı `SHA256SUMS.txt` ile doğrulayabilirsiniz.

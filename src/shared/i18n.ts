import type { AppLanguage } from "./types";

const EN_TO_TR: Record<string, string> = {
  "Combat Analysis": "Savaş Analizi",
  "Enemy Powers": "Düşman Güçleri",
  Timers: "Zamanlayıcılar",
  "Load Log": "Log Yükle",
  Export: "Dışa Aktar",
  Clear: "Temizle",
  Analysis: "Analiz",
  Encounter: "Karşılaşma",
  Healing: "İyileştirme",
  Tanking: "Tanklama",
  Mitigation: "Hasar Azaltma",
  Deaths: "Ölümler",
  Breakdown: "Döküm",
  "Damage Done": "Verilen Hasar",
  "Healing Done": "Verilen İyileştirme",
  "Damage Taken": "Alınan Hasar",
  "Healing Received": "Alınan İyileştirme",
  Targets: "Hedefler",
  "Out Hits": "Verilen Vuruşlar",
  "In Hits": "Alınan Vuruşlar",
  Resources: "Kaynaklar",
  Encounters: "Karşılaşmalar",
  "All Encounters": "Tüm Karşılaşmalar",
  Entities: "Birimler",
  All: "Tümü",
  Players: "Oyuncular",
  Pets: "Petler",
  Enemies: "Düşmanlar",
  "Search entities": "Birim ara",
  "No matching entity": "Eşleşen birim yok",
  "Encounter Summary": "Karşılaşma Özeti",
  Name: "Ad",
  Damage: "Hasar",
  Time: "Süre",
  "Crit %": "Crit %",
  "Flank %": "Flank %",
  "Damage In": "Alınan Hasar",
  Kills: "Öldürme",
  "Incoming Healing": "Alınan İyileştirme",
  Abilities: "Yetenekler",
  "Tanking / Incoming Damage": "Tanklama / Alınan Hasar",
  DamageTaken: "Alınan Hasar",
  "Hits Taken": "Alınan Vuruş",
  "Average Hit": "Ortalama Vuruş",
  "Max Hit": "Maks. Vuruş",
  "Incoming Damage": "Alınan Hasar",
  Mitigated: "Azaltılan",
  Events: "Olaylar",
  Average: "Ortalama",
  Largest: "En Büyük",
  Sources: "Kaynaklar",
  "Total deaths": "Toplam ölüm",
  "Deaths by Enemy Type": "Düşman Türüne Göre Ölümler",
  "Enemy Type": "Düşman Türü",
  "Fatal Ability": "Ölümcül Yetenek",
  "Players Killed": "Ölen Oyuncular",
  Last: "Son",
  "Resource Activity": "Kaynak Aktivitesi",
  "Net Change": "Net Değişim",
  "Loading entity detail…": "Birim detayı yükleniyor…",
  "Individual Out Hits": "Bireysel Verilen Vuruşlar",
  "Individual In Hits": "Bireysel Alınan Vuruşlar",
  Resource: "Kaynak",
  Source: "Kaynak",
  Target: "Hedef",
  Type: "Tür",
  Flags: "İşaretler",
  Elapsed: "Geçen Süre",
  Start: "Başlangıç",
  Duration: "Süre",
  "Enemy Power Frequency": "Düşman Gücü Sıklığı",
  Enemy: "Düşman",
  Casts: "Kullanım",
  "Estimated Interval": "Tahmini Aralık",
  "Observed Range": "Gözlenen Aralık",
  Confidence: "Güven",
  Added: "Eklendi",
  "Add Timer": "Zamanlayıcı Ekle",
  On: "Açık",
  Content: "İçerik",
  Interval: "Aralık",
  Warning: "Uyarı",
  Origin: "Kaynak",
  Delete: "Sil",
  "New Timer": "Yeni Zamanlayıcı",
  "Enemy power": "Düşman gücü",
  "Interval (sec)": "Aralık (sn)",
  "Warn before": "Önceden uyar",
  Display: "Görünüm",
  "Display & Overlay": "Görünüm & Overlay",
  "Saved automatically": "Otomatik kaydedilir",
  Language: "Dil",
  "Resolution / UI size": "Çözünürlük / UI boyutu",
  "Text size": "Yazı boyutu",
  "Overlay size": "Overlay boyutu",
  "Move Overlay": "Overlay'i Taşı",
  "Reset Position": "Konumu Sıfırla",
  Done: "Bitti",
  "Up to date": "Güncel",
  "Not up to date": "Güncel değil",
  "Update check failed": "Güncelleme kontrolü başarısız",
  "Checking update…": "Güncelleme kontrol ediliyor…",
  "Downloading…": "İndiriliyor…",
  Minimize: "Küçült",
  Maximize: "Büyüt",
  Restore: "Geri Yükle",
  Close: "Kapat",
  "Window controls": "Pencere kontrolleri",
  "+ New": "+ Yeni",
  "● Manual Active": "● Manuel Aktif",
  End: "Bitir",
  Fail: "Başarısız",
  "Click to sort": "Sıralamak için tıkla",
  "No combatlog selected": "Combatlog seçilmedi",
  "No combat data loaded": "Combat verisi yüklenmedi",
  "Combatlog is being analyzed": "Combatlog analiz ediliyor",
  "Load Combatlog": "Combatlog Yükle",
  LIVE: "CANLI",
  LOADING: "YÜKLENİYOR",
  ERROR: "HATA",
  IDLE: "BEKLEME",
  "No healing events in this scope.": "Bu kapsamda iyileştirme olayı yok.",
  "No incoming damage in this scope.": "Bu kapsamda alınan hasar yok.",
  "No shield mitigation events in this scope.": "Bu kapsamda shield hasar azaltma olayı yok.",
  "No player deaths caused by enemy powers in this scope.": "Bu kapsamda düşman güçlerinin neden olduğu oyuncu ölümü yok.",
  "No action/resource events in this scope.": "Bu kapsamda action/resource olayı yok.",
  "Select an entity to open its breakdown.": "Dökümünü açmak için bir birim seç.",
  "No events for this category.": "Bu kategoride olay yok.",
  "No data to graph.": "Grafik için veri yok.",
  "Hit Details": "Vuruş Detayları",
  "Select a table row or chart slice to see when and how the damage occurred.": "Hasarın ne zaman ve nasıl oluştuğunu görmek için tablo satırı veya grafik dilimi seç.",
  "No retained hits matched this selection.": "Bu seçimle eşleşen saklanmış vuruş yok.",
  "No encounter damage found for this entity.": "Bu birim için karşılaşma hasarı bulunamadı.",
  "Select an encounter to see exactly when and how much damage was dealt.": "Hasarın tam olarak ne zaman ve ne kadar verildiğini görmek için bir karşılaşma seç.",
  "Loading encounter hits…": "Karşılaşma vuruşları yükleniyor…",
  "No encounter selected.": "Karşılaşma seçilmedi.",
  "No retained outgoing hits for this encounter.": "Bu karşılaşma için saklanmış verilen vuruş yok.",
  "No single-target damage in this scope.": "Bu kapsamda tek hedef hasarı yok.",
  "No individual hits in this category.": "Bu kategoride bireysel vuruş yok.",
  "Enemy or power name": "Düşman veya power adı",
  "stable intervals only": "yalnızca kararlı aralıklar",
  "No powers match the current filter.": "Mevcut filtreyle eşleşen power yok.",
  "No timer rules have been created.": "Henüz zamanlayıcı kuralı oluşturulmadı.",
  "Choose a discovered enemy power and edit its interval.": "Bulunan bir düşman power'ını seç ve aralığını düzenle.",
  "The file stays connected and updates this window as the game appends new lines.": "Dosya bağlı kalır ve oyun yeni satırlar ekledikçe bu pencere güncellenir.",
  "Companion damage is shown as separate entities when enabled": "Etkinleştirildiğinde companion hasarı ayrı birimler olarak gösterilir",
  "Resize encounters and entities": "Karşılaşma ve birim panellerini yeniden boyutlandır",
  "Entity detail views": "Birim detay görünümleri",
  "Click for timestamped damage events": "Zaman damgalı hasar olayları için tıkla",
  "Click for timestamped hits": "Zaman damgalı vuruşlar için tıkla",
  "Resize encounters and hit timeline": "Karşılaşma ve vuruş zaman çizelgesini yeniden boyutlandır",
  "Resize targets and hit timeline": "Hedef ve vuruş zaman çizelgesini yeniden boyutlandır",
  "Resize power table and graph": "Power tablosu ve grafiği yeniden boyutlandır",
  "Turn Overlay On first, then choose Move Overlay.": "Önce Overlay'i aç, ardından Overlay'i Taşı'yı seç.",
  "Overlay position reset.": "Overlay konumu sıfırlandı.",
  "UI scale updated.": "UI ölçeği güncellendi.",
  "Text size updated.": "Yazı boyutu güncellendi.",
  "Overlay size updated.": "Overlay boyutu güncellendi.",
  "Language updated.": "Dil güncellendi.",
  "Display and overlay settings": "Görünüm ve overlay ayarları",
  "Display settings": "Görünüm ayarları",
  "Close display settings": "Görünüm ayarlarını kapat",
  "Move Overlay makes the timer overlay clickable temporarily. Drag it to the desired position, then press Done on the overlay.": "Overlay'i Taşı, timer overlay'ini geçici olarak tıklanabilir yapar. İstediğin konuma sürükle, ardından overlay üzerindeki Bitti düğmesine bas.",
  "Move overlay": "Overlay'i taşı",
  "Drag this overlay anywhere on screen, then press Done.": "Bu overlay'i ekranda istediğin yere sürükle, ardından Bitti'ye bas.",
  "Canlı güç bekleniyor": "Canlı güç bekleniyor",
  "Eşleşen düşman gücü kullanıldığında sayaç burada başlayacak.": "Eşleşen düşman gücü kullanıldığında sayaç burada başlayacak.",
};

const TR_TO_EN = new Map<string, string>(
  Object.entries(EN_TO_TR).map(([english, turkish]) => [turkish, english]),
);

export function languageFromLocale(locale: string | undefined | null): AppLanguage {
  return locale?.trim().toLocaleLowerCase("en-US").startsWith("tr") ? "tr" : "en";
}

export function translateUiText(value: string, language: AppLanguage): string {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.trim();
  if (!core) return value;

  const exact = language === "tr" ? EN_TO_TR[core] : TR_TO_EN.get(core);
  if (exact !== undefined) return `${leading}${exact}${trailing}`;

  const dynamic = language === "tr" ? toTurkish(core) : toEnglish(core);
  return dynamic === core ? value : `${leading}${dynamic}${trailing}`;
}

function toTurkish(value: string): string {
  let match = value.match(/^Overlay: (On|Off)$/);
  if (match) return `Overlay: ${match[1] === "On" ? "Açık" : "Kapalı"}`;

  match = value.match(/^Log Time: (.+)$/);
  if (match) return `Log Zamanı: ${match[1]}`;

  match = value.match(/^Pet of (.+)$/);
  if (match) return `${match[1]} peti`;

  match = value.match(/^Encounter (\d+)(.*)$/);
  if (match) return `Karşılaşma ${match[1]}${match[2]}`;

  match = value.match(/^Other \((\d+)\)$/);
  if (match) return `Diğer (${match[1]})`;

  match = value.match(/^(\d+) hits$/);
  if (match) return `${match[1]} vuruş`;

  match = value.match(/^(\d+) (death|deaths)$/);
  if (match) return `${match[1]} ölüm`;

  match = value.match(/^(\d+) total deaths$/);
  if (match) return `${match[1]} toplam ölüm`;

  match = value.match(/^(.+) · latest (\d+) retained hits$/);
  if (match) return `${match[1]} · son ${match[2]} saklanmış vuruş`;

  match = value.match(/^Detected: (.+) sec · confidence (\d+)%$/);
  if (match) return `Tespit: ${match[1]} sn · güven ${match[2]}%`;

  match = value.match(/^([\d.,]+) sec$/);
  if (match) return `${match[1]} sn`;

  match = value.match(/^Delete (.+)$/);
  if (match) return `${match[1]} karşılaşmasını sil`;

  match = value.match(/^Delete this encounter from the list\?([\s\S]*)$/);
  if (match) return `Bu karşılaşma listeden silinsin mi?${match[1]}`;

  match = value.match(/^Installed v(.+) · Latest v(.+)\. Click to download\.$/);
  if (match) return `Yüklü v${match[1]} · Son v${match[2]}. İndirmek için tıkla.`;

  match = value.match(/^Installed v(.+)\. Click to check again\.$/);
  if (match) return `Yüklü v${match[1]}. Yeniden kontrol etmek için tıkla.`;

  if (value.endsWith(". Click to retry.")) {
    return `${value.slice(0, -17)}. Yeniden denemek için tıkla.`;
  }

  return value;
}

function toEnglish(value: string): string {
  let match = value.match(/^Overlay: (Açık|Kapalı)$/);
  if (match) return `Overlay: ${match[1] === "Açık" ? "On" : "Off"}`;

  match = value.match(/^Log Zamanı: (.+)$/);
  if (match) return `Log Time: ${match[1]}`;

  match = value.match(/^(.+) peti$/);
  if (match) return `Pet of ${match[1]}`;

  match = value.match(/^Karşılaşma (\d+)(.*)$/);
  if (match) return `Encounter ${match[1]}${match[2]}`;

  match = value.match(/^Diğer \((\d+)\)$/);
  if (match) return `Other (${match[1]})`;

  match = value.match(/^(\d+) vuruş$/);
  if (match) return `${match[1]} hits`;

  match = value.match(/^(\d+) ölüm$/);
  if (match) return `${match[1]} deaths`;

  match = value.match(/^(\d+) toplam ölüm$/);
  if (match) return `${match[1]} total deaths`;

  match = value.match(/^(.+) · son (\d+) saklanmış vuruş$/);
  if (match) return `${match[1]} · latest ${match[2]} retained hits`;

  match = value.match(/^Tespit: (.+) sn · güven (\d+)%$/);
  if (match) return `Detected: ${match[1]} sec · confidence ${match[2]}%`;

  match = value.match(/^([\d.,]+) sn$/);
  if (match) return `${match[1]} sec`;

  match = value.match(/^(.+) karşılaşmasını sil$/);
  if (match) return `Delete ${match[1]}`;

  match = value.match(/^Bu karşılaşma listeden silinsin mi\?([\s\S]*)$/);
  if (match) return `Delete this encounter from the list?${match[1]}`;

  match = value.match(/^Yüklü v(.+) · Son v(.+)\. İndirmek için tıkla\.$/);
  if (match) return `Installed v${match[1]} · Latest v${match[2]}. Click to download.`;

  match = value.match(/^Yüklü v(.+)\. Yeniden kontrol etmek için tıkla\.$/);
  if (match) return `Installed v${match[1]}. Click to check again.`;

  if (value.endsWith(". Yeniden denemek için tıkla.")) {
    return `${value.slice(0, -29)}. Click to retry.`;
  }

  if (value === "Combatlog seçilmedi") return "No combatlog selected";
  if (value === "Combatlog açılıyor…") return "Opening combatlog…";
  if (value === "Yüklenmiş analiz verisi temizlensin mi?") return "Clear the loaded analysis data?";
  if (value === "Canlı güç bekleniyor") return "Waiting for live power";
  if (value === "Eşleşen düşman gücü kullanıldığında sayaç burada başlayacak.") {
    return "The timer will start here when a matching enemy power is used.";
  }

  return value;
}

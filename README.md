# Kanal Doluluk Analizi · TIME

Mevcut web panelinin ortak arşivli sürümü. Filtreler, kanal/reklamveren/marka/ana sektör analizleri, grafikler, ısı haritası ve Excel çıktısı kaynak web sürümünden gelir. Windows masaüstü arayüzünün birebir kopyası değildir.

## Kurulum (yalnızca Render)

Uygulamanın tamamı Render'da çalışır: tek bir Node web servisi ve kalıcı disk. Arşiv, anlık görüntüler, kullanıcılar ve denetim kaydı bu diskte (`/var/data`) durur. Başka bir barındırma, veritabanı veya depolama (Vercel, Supabase, GitHub Pages) gerekmez.

1. **Depo:** Kod bu GitHub deposundadır (Private). Render'ın dağıtacağı dal, uygulamanın bu sürümünü içermelidir. ADEX dosyalarını, şifreleri ve anahtarları depoya koyma; `.gitignore` `*.xlsx` ve `.env`'i dışlar.
2. **Blueprint:** Render Dashboard → **New → Blueprint** → bu depoyu bağla ve dalı seç. `render.yaml` şunları kurar: Node 24, **Pro** plan web servisi, 1 GB kalıcı disk, sağlık kontrolü (`/healthz`) ve ayarlar (`NODE_OPTIONS`, `RETENTION_DAYS`, `SNAPSHOT_KEEP`). Mevcut bir servisi bağlıyorsan planın ve ortam değişkenlerinin Blueprint ile eşleştiğini kontrol et. Ekrandaki güncel bedeli onaylamadan önce oku.
3. **Gizli değerler:** Render sorduğunda iki farklı, rastgele, en az 20 karakterli değer gir: `ADMIN_PASSWORD` (acil durum süper-yönetici hesabı) ve `INGEST_TOKEN` (Windows otomatik aktarımı). Bunları depoya yazma; yalnızca Render'da dururlar.
4. **İlk giriş:** Dağıtım bitince `https://<servis-adı>.onrender.com/login` adresini aç. Kullanıcı adı **admin**, şifre `ADMIN_PASSWORD` (süper-yönetici). Hemen **Kullanıcılar** ekranından her kişi için ayrı hesap aç ve günlük kullanımı onlara bırak; rolleri aşağıdaki tabloya göre ver. İlk süper-yönetici kişi hesabını (örn. e-posta adresinle) bu ekrandan oluştur; hesaplar depoda tutulmaz, canlı sistemde oluşturulur.
5. **Ayarlar:** Ayarlar ekranındaki *Beklenen kanallar* alanını doldur (örnek yazı alanın içindedir).
6. **İlk veri:** Yetkili bir ADEX dışa aktarımını **Veri yükle** ile yükle; geçmişi yüklemek için ADEX kaynak Excel'lerini kullan (en fazla `RETENTION_DAYS` günlük). Eski sistemin verisi kendiliğinden taşınmaz. Aynı aralığı masaüstü ve webde açıp kanal, spot kapsamı ve doluluk sonuçlarını karşılaştır.
7. **Otomatik aktarım:** Aşağıdaki Windows bölümüne bak. Özel alan adı kullanırsan `windows/Render-Gonder.ps1` yalnızca `*.onrender.com` adreslerini kabul ettiği için betikteki adres denetimini bilinçli olarak güncelle.

Dağıtımlar: Bağlı daldaki her push servisi yeniden kurar (`autoDeploy`). Kalıcı diskli servislerde dağıtım sırasında kısa bir kesinti olur; oturumlar ve veri korunur. Dağıtım sırasında bir otomatik aktarım denemesi düşerse betik hatayı loglar ve sonraki çalıştırmada yeniden dener.

## Dağıtım sonrası doğrulama

Servis ayağa kalktıktan sonra, canlı adrese karşı veriyi değiştirmeyen bir kontrol çalıştırabilirsin (kendi bilgisayarında, depoyu klonlayıp; yalnızca Node gerekir):

```bash
node test/verify-deploy.cjs https://<servis-adı>.onrender.com
```

Giriş yapmış kullanıcı ve aktarım anahtarı kontrolleri için şifreleri komut satırına değil ortam değişkenine yaz (betik hiçbirini ekrana basmaz). PowerShell:

```powershell
$env:VERIFY_USER='admin'; $env:VERIFY_PASSWORD='<ADMIN_PASSWORD>'; $env:VERIFY_INGEST_TOKEN='<INGEST_TOKEN>'
node test/verify-deploy.cjs https://<servis-adı>.onrender.com
```

Betik; sağlık kontrolünü, HTTPS/HSTS ve güvenlik başlıklarını (CSP dahil), oturumsuz erişimin kapalı olduğunu, çerez bayraklarını (`Secure`, `HttpOnly`, `SameSite=Strict`), aktarım anahtarının doğru tanımlandığını (boş dosyayla, veri yazmadan) ve yönetici uçlarını denetler. Diskin kalıcılığı betikle sınanamaz: bir kullanıcı ekleyip Render'dan *Manual Deploy → Restart* yaptıktan sonra hesabın durduğunu kontrol et.

## Eski sistemi kapatma (Vercel, Supabase, GitHub Pages)

Eski sürüm (React/Vite) Vercel'de, verisi Supabase'te çalışıyordu. Yeni sürüm bunlardan hiçbirini kullanmaz. Bu adımları depo dışında, ilgili hizmetlerde yap:

1. **Vercel:** vercel.com → ilgili proje → *Settings → Git → Disconnect* (bağlı kaldığı sürece her push için başarısız bir derleme denemesi yapar), sonra *Settings → Environment Variables*'taki `VITE_SUPABASE_*` değerlerini sil ve projeyi sil. Özel alan adı varsa DNS kaydını Render'a çevir veya kaldır.
2. **Supabase:** Önce `kanal-doluluk` bucket'ındaki Excel dosyalarını indirip yedekle; bunlar yeni sisteme ADEX kaynak dosyası olarak yüklenebilir. Eski bucket **herkese açık (public)** kurulmuştu; yedekten sonra bucket'ı sil veya projeyi sil, `anon` ve `service_role` anahtarlarını yenile.
3. **GitHub:** *Settings → Pages* ve *Secrets and variables → Actions* altındaki eski değerleri (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` vb.) sil. *Settings → Integrations*'ta Vercel uygulamasının bu depoya erişimini kaldır.
4. **`main` dalı:** Eski sistem hâlâ `main` dalındadır (Vercel belgeleri, `deploy.yml`, `SupabaseService.js`). Yeni sürüm `main`'e alınınca bunlar depodan kalkar. Render'ın Blueprint'i varsayılan olarak `main`'i dağıtır; yeni sürüm `main`'e alınmadan Blueprint'i `main` ile kurma.

## ADEX dosya biçimi (gerçek bir 10 Kasım dosyasıyla doğrulandı)

- **Başlıklar:** `MEDYA`, `Y.ANA SEKTÖR`, `Y.SEKTÖR`, `REKLAMIN FİRMASI`, `ÜRÜN TÜRÜ`, `MARKA`, `TARİH`, `SPOT TİPİ`, `SPOT TİPİ D.`, `BAŞLANGIÇ`, `BİTİŞ` zorunludur; `SÜRE` (saniye) varsa o esas alınır. `G.R.P - 20+ ABC1` (GRP) ve `GRPxSURE - 20+ ABC1` (GRPxSEC) varsa kayıtla birlikte saklanır ve GRP analizlerinde kullanılır; `ADET` gibi diğer sütunlar yok sayılır. GRP içermeyen eski kayıtlar çalışmaya devam eder; GRP'ye ihtiyaç duyulan dönemin dosyasını **Ekle** yöntemiyle yeniden yüklemek mevcut kayıtları GRP ile günceller (aynı dosyayı bir daha yüklemek hiçbir şeyi değiştirmez).
- **Tarih** `10.11.2026` biçiminde metindir. **Saatler** günün kesri olarak gelir; yayın günü 02:00'da başlayıp 26:00'da biter ve gece yarısından sonrası 1'in üzerinde bir değerdir (örn. 25:57 → 1,0817). Ayrıştırıcı bunu doğru okur.
- **Süre:** Bu dosyada `BİTİŞ`, spotun son saniyesini içerir; yani `BİTİŞ − BAŞLANGIÇ` her satırda `SÜRE`'den 1 sn kısadır. Hesap `SÜRE` sütununu kullanır. `SÜRE` olmayan eski dosyalarda bitiş−başlangıç kullanılır ve spot başına 1 sn eksik kalır.
- **Kanal adları** sayı (`360`) veya virgül (`Tv8,5`) içerebilir. Ayarlardaki *Beklenen kanallar* alanı bu yüzden noktalı virgülle ayrılır.

## Analiz görünümleri: GRP, saatlik doluluk, karşılaştırma

- **GRP ve GRPxSEC:** Her kanalın (veya marka/reklamveren/sektörün) **GRP**'si ve **GRPxSEC**'i. GRP, ADEX'in `G.R.P - 20+ ABC1` sütunudur (spot başına, 20+ ABC1 hedef kitle); GRPxSEC, ADEX'in `GRPxSURE - 20+ ABC1` sütunudur (= spotun GRP'si × süresi). Dosyada `GRPxSURE` yoksa GRP × spot süresi olarak hesaplanır. Bir spot saat/zaman dilimi sınırını veya analiz başlangıç saatini aşarsa iki değer de süreye orantılı bölünür; hariç tutulan ve belirsiz türlerin değerleri hesaba girmez. Panelde kanal bazında GRP çubukları ve tablo, sonuç tablosunda ve Excel'in Sonuçlar sayfasında GRP ve GRPxSEC sütunları bulunur.
- **Isı haritası görünümü:** Dönem ve saatlik ısı haritaları pastel palet ve sade tipografiyle çizilir (yeşil `%0–70`, sarı `%70–90`, pembe `%90 üstü`, beyaz `%0`, gri veri yok; yazı koyu lacivert, başlık açık mavi bant). Aynı renkler Excel çıktısında da kullanılır. Görünen tarihlerde **yıl yoktur**, biçim gün-aydır: günlük `16 Kas`, haftalık `09–15 Kas` (Pzt–Paz), aylık `Kasım`. (Tarih giriş kutuları tarayıcının kendi biçimini kullanır; Excel'in `Trend` ve `Bilgiler` sayfalarında ve `Karşılaştırma` sayfasındaki dönemler veri olarak ISO tarihli kalır.)
- **Saatlik doluluk:** Kanal × saat ısı haritası (07:00 – 25:00). Hücre = o saatte satılan süre ÷ kapasite (saat başına 720 sn); çok günlük aralıkta günlerin ortalamasıdır. **Gösterge** menüsünden GRP veya GRPxSEC'e çevrilir. Zaman dilimi ve kanal/marka/sektör filtreleri saatlik tabloyu da etkiler; hücre üzerine gelince saniye ve GRP görünür. Excel'de `Saatlik doluluk`, `Saatlik GRP` ve `Saatlik GRPxSEC` sayfaları olarak iner.
- **Dönem seçimi ve karşılaştırma:** Karşılaştırma, seçtiğiniz **tarih aralığını** baz alır (tek gün olmak zorunda değildir). Filtre alanında **Hızlı dönem** (Dün, Son 7 gün, Bu hafta, Geçen hafta Pzt–Paz, Son 30 gün, Bu ay, Geçen ay) tarihleri doldurur. **Karşılaştır** menüsü: *Önceki dönem* (aynı uzunlukta hemen önceki aralık; seçili aralık tam takvim ay(lar)ıysa hemen önceki ay(lar)), *7 gün önce* (her iki ucu 7 gün geri; en fazla 7 günlük aralıklarda, uzunsa dönemler örtüşeceğinden önceki döneme döner ve bunu belirtir), *Önceki ay (aynı günler)* (1–16 Kasım → 1–16 Ekim; tam ay → tam önceki ay) ve *Özel dönem* (başlangıç, istenirse bitiş; bitiş boşsa aynı uzunluk). Çözülen iki dönem ve gün sayıları filtrelerin altında ve panel başlığında yazar (ör. 10–16 Kasım ↔ 3–9 Kasım). Dönem uzunlukları farklıysa (özel dönemde) süre, GRP ve GRPxSEC değişimleri **günlük ortalamaya** göre hesaplanır, doluluk oranı uzunluktan etkilenmez. Kartlarda doluluk (puan farkı), reklam süresi, GRP ve GRPxSEC değişimi; kanal görünümünde kanal bazında fark tablosu; marka/reklamveren/sektör görünümünde **en çok artanlar / azalanlar**; trend grafiğinde karşılaştırma dönemi kesikli çizgi; Excel'de `Karşılaştırma` sayfası. Karşılaştırma döneminde kapsamı olmayan günler hesaba katılmaz ve panelde belirtilir. Birden çok ayı yan yana görmek için **Gruplama: Aylık** seçin (dönem bazında ısı haritası her ayı sütun yapar). Saklama süresi 6 ay olduğundan aylık karşılaştırma yaklaşık 5 ay geriye gider; yıllık (geçen yılın aynı dönemi) karşılaştırma için saklama süresinin uzatılması gerekir.

**Panel görünümü:** Üst bantta günlük işler (**Veri yükle**, **Excel'e aktar**) görünür; Kullanıcılar, Özet önizle, Silme talepleri, Veri sil, Ayarlar, Şifre ve Çıkış **Yönetim ▾** menüsündedir (Ekip kullanıcıları için menü **Hesap** adını alır). Karşılaştırma varsayılan olarak **önceki dönem**dir; kartlarda önceki döneme göre fark ve eğilim çizgisi görünür. Durum renkleri her yerde aynıdır: %0–70 yeşil, %70–90 sarı, %90+ gül (e-postayla aynı palet). Ana kanal çubuklarında 70 ve 90 eşikleri ve önceki dönem işareti, trend grafiğinde veri olmayan günler için boşluk (0 sayılmaz), hafta sonu bandı ve dönem ortalaması vardır.

**Reklam payı (Reklamverenler / Markalar / Sektörler):** Bu görünümlerde **kanal dağılımı** tablosu (ilk 12) ve **pay değişimi** (önceki döneme göre en çok pay kazanan / kaybeden 5'er varlık) bulunur. Hücre değeri iki biçimde seçilebilir: *kanal içi pay* (reklamverenin o kanalın reklam süresindeki payı) veya *dağılım* (reklamverenin kendi süresinin kanallara bölünmesi). Pay %10'un altında 1 ondalıkla (%4,4), üstünde tam sayı gösterilir. Excel'de aynı veriyle **Kanal dağılımı** sayfası (ilk 30) eklenir.

**Reklamveren / Marka / Sektör görünümleri yalnızca GRP ve GRPxSEC gösterir:** doluluk kartı, doluluk grafiği, karşılaştırmadaki doluluk kartı ve saatlik doluluk seçeneği bu görünümlerde yoktur; trend grafiği GRP'nin dönemsel değişimini gösterir, sonuç tablosu GRP'ye göre sıralanır. Kanal dağılımı (pay) tablosu ve Excel dışa aktarımı değişmedi.

**Boş kapasite:** sayfanın altındaki Boş Kapasite bölümü kaldırıldı; hesaplama Excel dışa aktarımındaki **Boş kapasite** sayfasında (Kanallar görünümü) duruyor.

**Pencereler:** Yönetim menüsünden açılan pencereler, pencerenin dışındaki boş alana tıklayınca (ya da Esc ile) kapanır.

**Zaman aralığı kutusu:** "7 ana kanal — doluluk" bölümünde her zaman aralığının (OPT, Erken PT, PT, Geç PT) yanında, seçili dönemin o aralıktaki 7 ana kanal doluluğu görünür (tüm filtreler uygulanır; işareti kaldırılmış aralıklar için de hesaplanır).

**Detaylı filtreler** düğmesi çerçeveli bir düğmedir; açık filtre sayısını (kanal grubu, sektör, reklamveren, marka, kısmi zaman dilimi) rozet olarak gösterir.

**Boş kapasite:** Kanal görünümünde **Boş kapasite** hesabı yalnızca Excel'deki aynı adlı sayfadadır (panelde bölüm gösterilmez): boş süre = kapasite (saat × 720 sn) − yayınlanan süre. Yalnız kapsamı olan kanal-günler sayılır; seçilen aralığın toplamıdır. İki tablo: kanal bazında (kapasite, boş saniye, boş oran, OPT / Erken PT / PT / Geç PT dilimlerine göre boş saniye ve **30 sn'lik yer sayısı**) ve en boş 15 kanal-saat. Filtreler (kanal, grup, zaman dilimi) panelle birlikte uygulanır.

## Kullanıcılar, oturum ve denetim kaydı

**Roller** (her rol bir altındakinin yetkilerini içerir)

| Yetki | Ekip | Yönetici | Süper-yönetici |
|---|:-:|:-:|:-:|
| Verileri görüntüler, filtreler, Excel çıktısı alır | ✓ | ✓ | ✓ |
| Excel yükler, dönemi yeniler | | ✓ | ✓ |
| Veri silme (**Veri sil**, **Eski kayıtları temizle**) için gerekçeli talep açar, kendi taleplerini görür/iptal eder | | ✓ | ✓ |
| Silme taleplerini onaylar veya reddeder; gerekçe yazarak doğrudan siler | | | ✓ |
| Hesaplama kuralları, beklenen kanallar, anlık görüntü listesi | | ✓ | ✓ |
| Anlık görüntüden geri yükler | | | ✓ |
| Kullanıcı ekler, siler, rol ve şifre değiştirir, hesabı kapatır | | | ✓ |
| Denetim kaydını görür | | | ✓ |

Yetkisiz bir isteğin kendisi de denetim kaydına (`denetim: yetkisiz deneme`) yazılır. Otomatik aktarım (`INGEST_TOKEN`) ayrı bir makine kimliğidir ve yalnızca veri yükleyebilir.

- **Hesaplar:** Kişi başına kullanıcı adı (veya e-posta adresi, örn. `ad.soyad@sirket.com`; küçük harf, girişte büyük/küçük harf fark etmez) ve şifre. Şifreler `scrypt` ile özetlenip `DATA_DIR/users.json` içinde tutulur (en az 12 karakter). Süper-yönetici kullanıcı ekler, siler, şifre sıfırlar, rol değiştirir ve hesabı kapatır; herkes kendi şifresini **Şifre** düğmesinden değiştirir. Kendi rolünü, hesabını veya kaydını değiştirmek/silmek engellidir. Silinen kullanıcının açık oturumları hemen düşer; geçmiş işlemleri denetim kaydında kalır.
- **`admin` hesabı:** `ADMIN_PASSWORD` ile girilen acil durum **süper-yönetici** hesabıdır; şifresi yalnızca Render ortam değişkeninden değişir ve silinemez. Süper-yöneticilerin hepsi hesabını kaybederse buradan toparlanır.
- **Oturum:** İmzalı, `HttpOnly` ve `SameSite=Strict` çerez, 12 saat. İmza anahtarı `DATA_DIR/session.key` dosyasındadır, yeniden dağıtımda oturumlar sürer. Şifre değişince veya hesap kapanınca o kişinin açık oturumları geçersiz olur. Çıkış, çerezi siler.
- **Deneme sınırı:** Aynı kullanıcı adına `LOGIN_MAX_FAILS` (varsayılan 8) başarısız denemeden sonra, aynı IP'den bunun üç katı denemeden sonra 15 dakika giriş kilitlenir. Sayaçlar bellekte tutulur, yeniden başlatmada sıfırlanır.
- **Denetim kaydı:** `DATA_DIR/audit.log` (JSON satırları, 5 MB'ta döner, 10 dosya). Kaydedilenler: giriş, başarısız giriş, çıkış, şifre değişikliği, kullanıcı işlemleri, veri yükleme (kim, mod, aralık, eklenen/güncellenen kayıt), reddedilen yükleme, geri yükleme, kural değişikliği, **Excel çıktısı** (kim, aralık, filtreler) ve yetkisiz deneme. Otomatik aktarım `ingest` adıyla görünür. Şifre ve anahtarlar kayda yazılmaz. Süper-yönetici kaydı **Kullanıcılar** ekranından görür. Excel çıktısı kaydı tarayıcıdan bildirildiği için bir kullanıcı bunu atlatabilir; veriyi kaydın dışında almasını engellemez (bkz. aşağıdaki ham veri notu).
- **Yedek:** `users.json`, `session.key` ve `audit.log` anlık görüntülere dahil değildir; Render disk anlık görüntüsü bunları da kapsar.

## Güvenlik başlıkları (CSP)

Her yanıtta `Content-Security-Policy` gönderilir: betikler yalnızca kendi kaynağımızdan (`script-src 'self'`) çalışır, satır içi betik, `eval` ve dış kaynak yoktur; sayfa çerçeveye alınamaz, `<base>` ve eklenti içeriği kapalıdır. Yalnızca grafik çubuklarının boyutu için stil *öznitelikleri*ne izin verilir (`style-src-attr`); `<style>` blokları ve dış stil dosyaları engelli. Ek olarak `Permissions-Policy`, `Cross-Origin-Opener-Policy` ve `Cross-Origin-Resource-Policy` ayarlıdır; HTTPS arkasında `Strict-Transport-Security` de eklenir.

Bu nedenle arayüz kodu `public/app.js` ve `public/app.css` dosyalarındadır. Sayfalara satır içi `<script>`, `<style>` veya `onclick=` gibi öznitelikler eklemeyin; `npm test` bunu denetler. Yeni bir dış kaynak (CDN, font, analitik) gerekirse `server.cjs` içindeki `CSP` listesini bilinçli olarak genişletin.

## Veri ve yetkiler

- Ortak arşiv Render diskinin `/var/data/archive.json.gz` dosyasında tutulur; tek servis örneği kullan. Panel ve veri uç noktaları oturum ister; yalnızca `/healthz` ve giriş sayfası herkese açıktır. Otomatik aktarım yalnızca `/api/import` için `INGEST_TOKEN` kullanır.
- Filtre ve Excel hesabı tarayıcıda yapıldığı için **giriş yapabilen ekip kullanıcılarına ADEX satırları da iletilir**. Ham veriyi görmeye yetkisi olmayan kimseye hesap açma. Müşteriye açık veya yalnızca özet veri sunan bir sürüm için bu paketi olduğu gibi kullanma.
- Admin mevcut tarayıcıdaki ADEX içe aktarımını ortak arşive yapar. Bir ekip üyesi değişiklikleri sayfayı yenileyerek görür; durum satırında verinin kim tarafından yüklendiği yazar.
- Üretim verisini yüklemeden önce ADEX verisini ajans içinde bu şekilde kullanma yetkinizi teyit edin. Arşiv yedeği için Render disk anlık görüntüsü veya admin hesabıyla `/api/state` çıktısını güvenli bir yerde saklayın.

## Uzak Windows bilgisayarından otomatik gönderim

Windows'taki ADEX ve Excel otomasyonu yerinde kalır. `windows/Render-Gonder.ps1` dosyasını ADEX betiğinin yanına koy. Görevi çalıştıran Windows kullanıcısının ortam değişkenlerine `DOLULUK_RENDER_URL` (HTTPS Render adresi) ve `DOLULUK_INGEST_TOKEN` (Render'daki `INGEST_TOKEN`) değerlerini ekle. Bunlar Windows'un kullanıcı ortam değişkenleri ekranından ayarlanabilir.

Güncel ADEX betiğinde başarılı aktarım logundan sonra, Excel dosyası kapanmışken ve log/kapatma akışını bozmadan şu çağrıyı ekle. Paket, uzak bilgisayardaki güncel betiği kendiliğinden değiştirmez:

```powershell
try {
    $renderResult = & (Join-Path $PSScriptRoot 'Render-Gonder.ps1') -ExcelPath $file -StartDate $fromDay -EndDate $day
    Log "RENDER BASARILI: $($renderResult.total) ortak kayit"
    if ($renderResult.warning) { Log "RENDER UYARI: $($renderResult.warning)" }
    if ($renderResult.missingChannels.Count) { Log "RENDER UYARI: dosyada eksik kanallar: $($renderResult.missingChannels -join ', ')" }
} catch {
    Log "RENDER HATA: $($_.Exception.Message)"
}
```

Çağrı her çalıştırmada yalnızca verilen tarih aralığını yeniler ve dosyada aralık dışı veya eksik gün varsa reddeder. Geçmiş arşiv için önce panelden geriye dönük yükleme yapın. Excel yerel olarak kaydedilmişse başarısız Render aktarımı yardımcı betikle tekrar gönderilebilir.

## Veri kapsamı (kanal-gün bazında)

Doluluk kapasitesi yalnızca **kaydı olan kanal-günler** için hesaplanır. Her kanal-gün iki durumdan birindedir:

- **Doğrulanmış:** Otomatik aktarımla gelen aralıktaki, dosyada bulunan her kanal için her gün; ya da admin'in yüklemede "içindeki her kanalın seçilen dönemini eksiksiz kapsıyor" seçeneğini işaretlediği kanal-günler. Gerçekten reklamsız bir gün de doğrulanırsa %0 doluluk sayılır.
- **Doğrulanmamış:** Yalnızca kaydı olduğu için kapsamda sayılan gün. Rakam hesaplanır ama panelde uyarı çıkar ve ısı haritasında `*` ile işaretlenir.

Ayarlar ekranındaki **Beklenen kanallar** listesi doldurulursa, otomatik aktarım dosyasında bu kanallardan biri hiç yoksa yanıt `missingChannels` ile uyarır ve o kanalın aralıktaki günlerinin doğrulaması kaldırılır. Bir aralık doğrulamasız yenilenirse o aralığın doğrulaması da düşer. Eski arşivlerdeki tek "kapsam doğrulandı" bayrağı ilk açılışta otomatik olarak kanal-gün doğrulamasına çevrilir.

## Anlık görüntüler ve geri alma

Her veri yüklemesinden (panel veya otomatik aktarım) önce mevcut arşivin kopyası `DATA_DIR/snapshots` klasörüne alınır. Son `SNAPSHOT_KEEP` adet saklanır (varsayılan 14; ortam değişkeniyle değiştirilir). Görüntü alınamazsa yükleme yapılmaz; doğrulamada reddedilen yüklemeler görüntü oluşturmaz.

Admin, panelde **Ayarlar → Anlık görüntüler** bölümünden bir kopyayı geri yükleyebilir; geri yüklemeden önce mevcut hâl de kopyalanır, yani geri alma da geri alınabilir. Kural değişiklikleri görüntü almaz. Görüntüler aynı diskte durur: `render.yaml`'daki 1 GB disk, arşiv boyutunun `SNAPSHOT_KEEP + 1` katını karşılamalı. Disk bozulursa bu bir yedek değildir; Render disk anlık görüntüsünü de kullanın.

## E-posta bildirimi

Sunucu e-postayı iki yoldan biriyle gönderir (ek paket gerekmez): **Microsoft Graph** (Microsoft 365 için önerilen; SMTP AUTH kapalı kuruluşlarda da çalışır) veya sağlayıcıdan bağımsız **SMTP**. `GRAPH_*` değişkenlerinden biri bile tanımlıysa Graph kullanılır; SMTP değişkenleri o zaman yok sayılır. Ayarlar yalnızca Render'daki ortam değişkenleridir; **hiçbiri depoya yazılmaz**. Gerekli değişkenler tanımlıysa bildirim açılır, yoksa kapalı kalır (panelde "Kullanıcılar" ekranında durum ve eksik değişken adları görünür).

### Microsoft Graph kurulumu (Microsoft 365)

1. **Entra ID → Uygulama kayıtları** (`entra.microsoft.com`): uygulamanın **Genel bakış** sayfasındaki *Uygulama (istemci) kimliği* ve *Dizin (kiracı) kimliği* değerlerini al; **Sertifikalar ve gizli diziler**'den oluşturulan gizli anahtarın **Değer** sütununu (yalnızca oluşturulurken görünür) kullan.
2. **API izinleri → İzin ekle → Microsoft Graph → Uygulama izinleri → `Mail.Send`**; ardından **\<kuruluş\> için yönetici onayı ver**. (Temsilci izni değil, *Uygulama* izni olmalı.)
3. **Önerilen kısıtlama:** `Mail.Send` uygulama izni varsayılanda kiracıdaki *tüm* posta kutuları adına göndermeye izin verir. Exchange Online PowerShell ile yalnızca gönderen kutuyla sınırla:
   ```powershell
   New-DistributionGroup -Name "kanal-doluluk-gonderen" -Type Security -Members bilgi@time-tr.com
   New-ApplicationAccessPolicy -AppId <istemci-kimliği> -PolicyScopeGroupId kanal-doluluk-gonderen -AccessRight RestrictAccess -Description "Kanal Doluluk yalniz bilgi@ kutusu"
   Test-ApplicationAccessPolicy -Identity bilgi@time-tr.com -AppId <istemci-kimliği>
   ```
4. Gönderen kutunun (`bilgi@time-tr.com`) lisanslı bir posta kutusu (veya paylaşılan posta kutusu) olması gerekir.
5. Render → *Environment*'a ekle: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_FROM` (örn. `Kanal Doluluk <bilgi@time-tr.com>`). Eski `SMTP_*` değişkenlerini silebilirsin. Kaydet → servis yeniden başlar → **Kullanıcılar → Test e-postası gönder**.
6. Hata mesajları ekranda Microsoft'un kodunu gösterir (gizli anahtar asla görünmez): `invalid_client / AADSTS7000215` gizli anahtar yanlış (kimliği değil *Değer*'i gir), `AADSTS7000222` anahtarın süresi dolmuş, `ErrorAccessDenied` izin/yönetici onayı ya da erişim ilkesi, `MailboxNotEnabledForRESTAPI`/`ErrorInvalidUser` gönderen kutu bulunamıyor veya lisanssız.
7. Gizli anahtarın süresi dolar (en çok 24 ay); dolmadan yenisini oluşturup Render'da değiştir.

Graph iletileri ham MIME olarak gönderir; gömülü logolar ve düz metin yedeği SMTP ile aynıdır. Gönderilen iletiler gönderen kutunun *Gönderilmiş Öğeler* klasöründe de görünür.

### Ortam değişkenleri

| Ortam değişkeni | Anlamı |
|---|---|
| `ADMIN_EMAIL` | (isteğe bağlı) acil durum `admin` hesabının bildirim adresi; bu adrese de Süper-yönetici bildirimleri ve özet denemeleri gider |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | Microsoft Graph (uygulama izni `Mail.Send`); gönderen `MAIL_FROM` adresidir |
| `SMTP_HOST` | (SMTP kullanılacaksa) SMTP sunucusu (örn. `smtp.gmail.com`) |
| `SMTP_PORT` | `465` (doğrudan TLS, varsayılan) veya `587` (STARTTLS). `SMTP_SECURE=true/false` ile değiştirilir |
| `SMTP_USER`, `SMTP_PASSWORD` | (SMTP) Gönderen posta kutusunun kullanıcı adı ve şifresi (uygulama şifresi / API anahtarı) |
| `MAIL_FROM` | Gönderen, örn. `Kanal Doluluk <bildirim@sirket.com>` (sağlayıcının izin verdiği adres) |
| `PUBLIC_URL` | (isteğe bağlı) e-postadaki panel bağlantısı; Render'da `RENDER_EXTERNAL_URL` otomatik kullanılır |
| `NOTIFY_ON` | (isteğe bağlı) virgülle ayrılmış bildirim türleri; varsayılan hepsi: `delete-request,delete-decision,import,import-auto,import-rejected,daily-summary` |
| `SUMMARY_TIME`, `SUMMARY_DAYS` | (isteğe bağlı) günlük özet saati (`HH:MM`, İstanbul; varsayılan `11:00`) ve günleri (0=Pazar … 6=Cumartesi; varsayılan `1,2,3,4,5`) |
| `NOTIFY_EMAILS` | (isteğe bağlı) hesabı olmayan ek alıcılar; süper-yönetici ve yönetici bildirimlerine eklenir |

**Kime ne gider**

| Olay | Alıcı |
|---|---|
| Yönetici silme talebi açtı (`delete-request`) | Süper-yöneticiler: gerekçe, kapsam, etkilenecek kayıt sayısı |
| Talep onaylandı / reddedildi / süper-yönetici iptal etti (`delete-decision`) | Talebi açan kişi (not dahil) |
| Panelden veri yüklendi (`import`) | Yöneticiler ve süper-yöneticiler (yükleyen hariç): eklenen/güncellenen/atlanan, arşiv toplamı, uyarılar |
| Otomatik (Windows) aktarım tamamlandı (`import-auto`) | Yöneticiler ve süper-yöneticiler: aynı özet, eksik kanal ve saklama uyarısı |
| Otomatik aktarım reddedildi (`import-rejected`) | Süper-yöneticiler: neden ve aralık |
| Hafta içi her gün 11:00 (`daily-summary`) | **E-postası olan ve hesabı açık herkes** (Ekip dahil): dünün özeti |

Ekip kullanıcıları günlük özet dışında bildirim almaz. Alıcının adresi, kullanıcının **E-posta** alanıdır (Kullanıcılar ekranından eklenir/düzenlenir); alan boşsa ve kullanıcı adı e-posta biçimindeyse (`ad@sirket.com`) kullanıcı adı kullanılır. Adresi olmayan kullanıcıya bildirim gitmez. Her alıcıya ayrı ileti gider, adresler birbirini görmez.

**Kurulum:** Render → servis → *Environment* → yukarıdaki değişkenleri ekle → kaydet (servis yeniden başlar). Sonra kendi kişi hesabına e-posta ekleyip **Kullanıcılar → Test e-postası gönder**'e bas. Hata olursa ekranda sunucunun yanıtı görünür (şifre görünmez).

- **Google Workspace:** `smtp.gmail.com`, `465`, kullanıcı = gönderen posta kutusunun tam adresi, şifre = o hesap için üretilmiş **uygulama şifresi** (hesapta 2 adımlı doğrulama açık olmalı ve yönetici konsolunda izin verilmiş olmalı), `MAIL_FROM` aynı adres.
- **SendGrid / Brevo / Resend / Mailgun:** sağlayıcının SMTP bilgilerini gir (örn. SendGrid: `smtp.sendgrid.net`, kullanıcı `apikey`, şifre = API anahtarı); gönderen alan adını sağlayıcıda doğrulamak gerekir.
- **Microsoft 365:** SMTP yerine yukarıdaki **Microsoft Graph** yolunu kullan (SMTP AUTH / temel kimlik doğrulama Microsoft tarafından kapatılmaktadır).
- Render'ın **ücretsiz** planı SMTP portlarını engeller; ücretli (Pro) planda açıktır.

**Güvenlik ve davranış:** Şifre yalnızca şifreli bağlantıda (465 veya STARTTLS) gönderilir; sunucu şifreli bağlantı sunmazsa kimlik bilgisi hiç gönderilmez ve sertifika doğrulaması kapatılamaz. E-posta hataları işlemi bozmaz: yükleme/silme yine tamamlanır, hata denetim kaydına `E-posta gönderilemedi` olarak yazılır. E-postalara yalnızca özet bilgi ve panel bağlantısı konur; ADEX kayıtları, şifreler veya anahtarlar konmaz. Bildirimler anlık değil sıralı gönderilir (kuyruk 100 ileti ile sınırlıdır).

## Günlük özet e-postası

Hafta içi her gün **11:00'da (İstanbul saati)**, e-posta adresi tanımlı ve hesabı açık **herkese** (Ekip, Yönetici, Süper-yönetici) dünün özeti gider. Yeni kullanıcı eklediğinizde (e-postasıyla) ertesi iş günü kendiliğinden listeye girer; özeti almak istemeyen birinin hesabından e-posta adresi kaldırılır. Her alıcıya ayrı ileti gider; `NOTIFY_EMAILS` ek alıcıları bu özete dahil değildir.

E-posta **grafikli HTML** olarak gelir (KPI kartları ve fark etiketleri, 7 ana kanal için renkli doluluk çubukları, saatlik doluluk şeridi, GRP çubukları, uyarı kutusu, "Panele git" düğmesi); HTML göstermeyen istemciler için aynı içeriğin düz metin sürümü de eklenir. HTML, e-posta istemcilerinde güvenle görünmesi için yalnızca tablo ve satır içi stil kullanır (betik, dış resim yok).

**Dönem ve karşılaştırma:** Salı–Cuma günleri özet **dünü** bir önceki günle karşılaştırır (e-postada "bir önceki gün" yazar). **Pazartesi** günü veri hafta sonu toplu yüklendiği için özet **Cuma–Cumartesi–Pazar'ı (3 gün toplamı)** bir önceki haftanın Cuma–Cumartesi–Pazar'ıyla karşılaştırır ("önceki hafta"). E-postanın üstünde karşılaştırılan tarihler yazar. Dönemde verisi olmayan gün varsa (ör. Cuma yüklenmemiş) bu uyarı olarak yazılır ve iki tarafta da yalnızca verisi olan günler hesaba katılır.

İçerik (panelle aynı hesap çekirdeğiyle üretilir, rakamlar birebir aynıdır):
- **Günün öne çıkanları** (en üstte, yapay zekâsız, kural tabanlı): en çok düşen / yükselen ana kanal (5 puan ve üzeri; "Atv %43 → %48 (+%5)" biçiminde önceki ve sonraki değerle), doluluk ile GRP'nin ters yönde hareketi, %90 üzeri kanallar ya da en dolu kanal, yoğun saatin kayması. Belirgin değişim yoksa bunu söyler. Rakamlar e-postanın geri kalanıyla aynı hesaptan gelir.
- Genel doluluk ve **önceki haftanın aynı gününe** göre fark (önceki değerle birlikte, ör. %9 → %10 (+%1)), reklam süresi, GRP ve GRPxSEC değişimi.
- **7 ana kanal**: doluluk (sıralı), önceki haftaya göre fark, GRP; diğer kanalların ortalaması; en yoğun ve en sakin saat; en yüksek GRP'li kanallar.
- **Uyarılar**: beklenen kanalın o gün verisi yok, doğrulanmamış kapsam, kapsamı olmayan kanal-gün, belirsiz tür süresi, geçersiz kayıt.
- **Dünün verisi yüklenmemişse** e-posta bunu açıkça yazar ("DİKKAT: Dün için arşivde veri yok") ve verisi olan son günü özetler. Pazartesi günkü özet Pazar gününü kapsar.

Zamanlama: sunucu her dakika kontrol eder; özet o gün bir kez gönderilir (durum `summary-state.json` içinde saklanır, yeniden başlatma tekrar göndermez). Sunucu 11:00'da kapalıysa, açıldığında **3 saat içinde** yetişir. Gönderim başarısız olursa işaretlenmez; 10 dakika arayla en fazla 3 kez denenir ve hata denetim kaydına `E-posta gönderilemedi` olarak yazılır. Gönderim denetim kaydında `Günlük özet gönderildi` olarak görünür. **Kullanıcılar** ekranındaki **Günlük özeti bana gönder** düğmesi (Süper-yönetici) özeti yalnızca kendi adresinize anında gönderir; tasarımı denemek için kullanın; yanındaki **Önizle** bağlantısı aynı e-postayı göndermeden tarayıcıda açar.

**Açılış tarihi:** Panel açıldığında rapor başlangıcı içinde bulunulan ayın 1'idir (arşivdeki ilk veri tarihi değil); bitiş, tamamlanmış son gündür. Ayın 1'inde veya son veri önceki aydaysa başlangıç, o son verinin ayının 1'i olur, böylece aralık boş kalmaz. Tarihleri yine elle ya da hızlı dönem listesinden değiştirebilirsiniz.

### Veri durumu ve yükleme sonrası kontrol (A11)

- **Veri durumu yalnızca yükleme e-postasındadır** (Süper-yönetici/Yönetici alır); herkese giden günlük özette yer almaz.
- **Yükleme sonrası veri durumu:** Her yüklemeden hemen sonra (panelden ya da otomatik aktarımla) bir sonraki özetin dönemi için kontrol yapılır ve **"Yeni veri yüklendi" / "Otomatik veri aktarımı tamamlandı" e-postasının içine "Veri durumu" bölümü** olarak eklenir: özet dönemi için kaç günün verisi olduğu, kanal ve kayıt sayısı, arşivin kapsadığı aralık, GRP'li kayıt oranı ve sorunlar (verisi olmayan gün, beklenen kanal yok, GRP'siz kayıt, doğrulanmamış kapsam, belirsiz tür, onaylanan uyarılar) ya da "Eksik veya sorun yok". Yükleyen, yöntem ve eklenen/güncellenen/atlanan sayıları e-postanın üst kısmındadır. Ayrı bir zamanlanmış kontrol yoktur; geç yüklemeler (örn. 10:30) gereksiz bir kontrol çalıştırmaz. Hedef özet: hafta içi bugünkü özet henüz gitmediyse bugünün, gittiyse sonraki iş gününün özeti (Pazartesi özeti Cuma–Pazar'ı kapsar).

## Yükleme öncesi kontrol

Panelden Excel yüklerken dosya kaydedilmeden önce kontrol edilir. Şunlardan biri varsa **hiçbir şey yazılmaz**; uyarılar listelenir ve "Yine de yüklemek istiyor musunuz?" diye sorulur (Tamam derseniz dosya aynı seçeneklerle yüklenir):
- Dosyada GRP / GRPxSEC sütunu yok ya da GRP'si boş kayıtlar var (%2'den fazlası).
- Dosya aralığında hiç verisi olmayan gün var.
- Beklenen kanallar dosyada yok, ya da bazı kanal-günlerin verisi eksik.
- "Dönemi yenile"de aralıktaki mevcut kayıtlar silinip yerine belirgin biçimde (%20'den fazla) az kayıt yazılacak.

Onaylanıp yüklenen dosyanın uyarıları denetim kaydına ve yükleme bildirimine yazılır. Reddedilen/onay bekleyen denemeler denetim kaydında `import-warned` olarak görünür. Windows otomatik aktarımı engellenmez; uyarılar bildirim e-postasında belirtilir.

Yüzdeler (panel, e-posta, Excel) ondalıksız, tam sayı olarak gösterilir; GRP ve GRPxSEC değerleri ondalıklı kalır.

**Marka:** time logosu panelin üst bandında, giriş sayfasında ve e-postanın başlığında; "powered by Growity AI Studio" panelin altında, giriş sayfasında ve e-postanın altında yer alır (dosyalar `public/logo-time.png`, `public/logo-growity.png`). E-postada logolar iletinin içine gömülür (`cid:`), bu yüzden e-posta istemcilerinde "resimleri göster" demeden ve dış adrese gitmeden görünür.

**Tema:** Renk rolleri sabittir: **mavi** doluluk, süre ve pay; **pembe** (TIME logosundaki vurgu, `#e2215f`) GRP ve marka vurgusudur (GRP çubukları, GRP trendi, saatlik GRP ısı hücreleri, başlık çizgisi, e-posta başlığı). Doluluk durum renkleri (yeşil %0–70, sarı %70–90, gül %90+) panelde ve e-postada aynıdır ve değişmedi. Yüzeyler yumuşatıldı (daha yuvarlak köşeler, hafif gölgeler, odak halkaları); stil `public/app.css` ve `public/login.css` sonundaki "Tema v2" bölümündedir. Telefon genişliğinde (390 px) yatay taşma yoktur.

## Veri silme (gerekçe ve süper-yönetici onayı)

Veri azaltan işlemler gerekçe ister ve **süper-yönetici onayından** geçer:

- **Veri sil** (üst menü): tarih aralığı ve isteğe bağlı kanal seç, **Önizle** ile kaç kaydın etkileneceğini gör, **gerekçe** yaz (en az 10 karakter). Yönetici için düğme **Onaya gönder** olur: talep açılır, **hiçbir şey silinmez**. Süper-yönetici için düğme **Sil**'dir ve gerekçeyle doğrudan siler (kayıt "otomatik onaylı" olarak tutulur).
- **Eski kayıtları temizle** (saklama sınırı uyarısındaki düğme): aynı akıştan geçer; gerekçe sorulur, yönetici için talep açılır.
- **Silme talepleri** (üst menü, bekleyen sayısı rozetle gösterilir): süper-yönetici gerekçeyi ve etkilenecek kayıt sayısını görür, **Onayla** (silme anında yapılır, öncesinde anlık görüntü alınır) veya **Reddet** (nedeniyle) der. Talebi açan kişi, bekleyen talebini iptal edebilir; süper-yönetici de iptal edebilir. Kimse kendi talebini onaylayamaz. Yönetici kendi taleplerini ve durumlarını görür; en fazla 5 bekleyen talebi olabilir.
- **Geri yükleme** yalnızca süper-yöneticidedir, çünkü eski bir görüntüye dönmek sonradan eklenen verileri de siler.
- **Denetim kaydı:** talep, onay, ret, iptal ve silmenin kendisi (`gerekçe`, talep eden, onaylayan, silinen kayıt sayısı) kaydedilir. Talepler `DATA_DIR/delete-requests.json` içinde durur ve yeniden başlatmada korunur.

Aynı aralığın kanal-gün kapsamı ve doğrulaması da silinir; boşalan günler "kapsam yok" görünür. Sınır: *Veri yükle → Dönemi yenile* bir dönemin eski kayıtlarını yeni dosyayla değiştirir (yönetici yapabilir, denetim kaydına yazılır); bunun için ayrı bir onay yoktur.

## Saklama süresi ve temizlik

Arşiv ham spot satırlarını **6 ay (183 gün)** tutmak üzere tasarlanmıştır; günlük ve haftalık karşılaştırmalar için bu yeterlidir. Sınır `RETENTION_DAYS` ortam değişkeniyle değişir. Arşivdeki en eski ve en yeni kayıt arası bu süreyi aşarsa:

- Yöneticiye sayfanın üstünde ve **Veri yükle** penceresinde uyarı gösterilir (yükleme yine de yapılabilir).
- Otomatik aktarım yanıtında `warning` alanı döner; yukarıdaki PowerShell örneği bunu `RENDER UYARI` olarak loglar.
- Uyarıdaki **Eski kayıtları temizle** düğmesi, son kayıttan geriye `RETENTION_DAYS` günden eski satırları siler. Önce kaç kaydın silineceği gösterilir ve onay istenir. Silmeden önce otomatik anlık görüntü alınır (**Ayarlar → Anlık görüntüler**'den geri yüklenir) ve işlem denetim kaydına yazılır.

Arşiv kendiliğinden silinmez; temizlik her zaman yöneticinin onayıyla yapılır. Ölçüme göre 6 ay (~640 bin satır, günde 3.500 satır varsayımıyla) sunucuda yaklaşık 0,5 GB boşta bellek ve ~1 GB aktarım tepesi demektir.

## Ölçek testi

`npm run scale` sentetik ADEX arşivi üretir (varsayılan günde ~3.500 satır, 15 kanal), sunucuyu bu arşivle başlatır ve bellek, açılış, yükleme süresi, olay döngüsü duraklaması ve tarayıcı tarafı hesabını ölçer. Seçenekler: `--days=90,365,730`, `--rows-per-day=N`, `--heap=384` (Render Starter'a benzetmek için sunucu heap sınırı), `--browser --browser-days=365` (gerçek Chromium ölçümü; `playwright` gerekir), `--out=sonuc.json`. `npm test`'e dahil değildir.

Ölçüm (4 CPU / 16 GB makine, günde 3.500 satır varsayımıyla; gerçek günlük satır sayınızla tekrarlayın). Sunucu belleği satır başına yaklaşık 0,75 KB'tır:

| Arşiv | Satır | Sunucu boşta RSS | 1 günlük otomatik aktarım (donma) | Aylık dosya yükleme (donma) | Aktarımda tepe bellek | Tarayıcıya inen durum |
|---|---|---|---|---|---|---|
| 365 gün | 1,28 milyon | 0,97 GB | 0,4 sn | 4,0 sn | 1,2 GB | 158 MB (22 MB gzip) |
| 730 gün | 2,55 milyon | 1,8 GB | 0,5 sn | 4,9 sn | 2,0 GB | 316 MB (45 MB gzip) |
| 1095 gün | 3,83 milyon | 2,7 GB | — | 4,8 sn | 3,0 GB | 474 MB (67 MB gzip) |

"Donma", aktarım sırasında diğer isteklerin (sayfa açma, filtreleme, Render'ın sağlık kontrolü) beklediği en uzun süredir. XLSX ayrıştırması ayrı bir iş parçacığında yapılır; bu yüzden 130 bin satırlık (≈15 günlük, 23 MB) bir dosyada donma ≈0,5 sn'dir (iş parçacığı olmadan ≈6 sn idi ve yavaş bir CPU'da Render'ın sağlık kontrolünü aşıp servisi yeniden başlatabilirdi; yükleme o zaman "is not valid JSON" hatasıyla düşerdi). Tablodaki "aylık dosya" sütunu bu iyileştirmeden önceki ölçümdür. Dosyanın işlenmesi `PARSE_TIMEOUT_MS` (varsayılan 180 sn) ile sınırlıdır; bellek yetmezse yükleme, dosyayı daha kısa dönemlere bölmeyi öneren bir hata ile reddedilir. Tekrar-kontrolü yalnızca gelen dosyanın günleri için yapılır, arşiv parça parça yazılır ve durum değiştiren işlemler (yükleme, kural, geri yükleme) sırayla çalışır.

Tarayıcı tarafı değişmedi: 1 yıllık arşivde tarayıcı yaklaşık 1,5 GB bellek kullanır ve her açılışta 22 MB iner.

**Render planı:** `render.yaml` **Pro** plan (4 GB RAM) ve `NODE_OPTIONS=--max-old-space-size=3072` ile gelir. Bu planda 3 yıla kadar geçmiş bellekte tutulabilir; 6 aylık varsayılan saklama süresiyle rahat bir marj kalır. 512 MB'lık Starter'da 90 günden uzun geçmiş sunucuyu çökertebilir (`--heap=384` ile ölçüldü).

## Yerel çalıştırma

Node.js 24 ile üç gizli değeri işletim sisteminin ortam değişkenlerinden tanımla; sonra `npm ci` ve `npm start` çalıştır. Yerel adres `http://localhost:3000`, arşiv klasörü varsayılan olarak `data/` olur. Yerel sunucuya internetten erişim açma.

## Geliştirme notları

- Hesaplama çekirdeği tek dosyada: `public/core.js`. Sayfa, Web Worker ve sunucu aynı dosyayı kullanır; testler de bunu çağırır.
- `npm test`: hesaplama birim testleri (`test/core.cjs`), sunucu/yetki/içe aktarım testi (`test/smoke.cjs`) ve Excel çıktısı (`test/export.cjs`). Node 24 gerekir (Render'da `engines` ile sabitlidir).

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

- **Başlıklar:** `MEDYA`, `Y.ANA SEKTÖR`, `Y.SEKTÖR`, `REKLAMIN FİRMASI`, `ÜRÜN TÜRÜ`, `MARKA`, `TARİH`, `SPOT TİPİ`, `SPOT TİPİ D.`, `BAŞLANGIÇ`, `BİTİŞ` zorunludur; `SÜRE` (saniye) varsa o esas alınır. `ADET`, `G.R.P…` gibi diğer sütunlar yok sayılır.
- **Tarih** `10.11.2026` biçiminde metindir. **Saatler** günün kesri olarak gelir; yayın günü 02:00'da başlayıp 26:00'da biter ve gece yarısından sonrası 1'in üzerinde bir değerdir (örn. 25:57 → 1,0817). Ayrıştırıcı bunu doğru okur.
- **Süre:** Bu dosyada `BİTİŞ`, spotun son saniyesini içerir; yani `BİTİŞ − BAŞLANGIÇ` her satırda `SÜRE`'den 1 sn kısadır. Hesap `SÜRE` sütununu kullanır. `SÜRE` olmayan eski dosyalarda bitiş−başlangıç kullanılır ve spot başına 1 sn eksik kalır.
- **Kanal adları** sayı (`360`) veya virgül (`Tv8,5`) içerebilir. Ayarlardaki *Beklenen kanallar* alanı bu yüzden noktalı virgülle ayrılır.

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

Sunucu, sağlayıcıdan bağımsız SMTP ile e-posta gönderir (ek paket gerekmez). Ayarlar yalnızca Render'daki ortam değişkenleridir; **hiçbiri depoya yazılmaz**. Beşi de tanımlıysa bildirim açılır, yoksa kapalı kalır (panelde "Kullanıcılar" ekranında durumu görünür).

| Ortam değişkeni | Anlamı |
|---|---|
| `SMTP_HOST` | SMTP sunucusu (örn. `smtp.gmail.com`) |
| `SMTP_PORT` | `465` (doğrudan TLS, varsayılan) veya `587` (STARTTLS). `SMTP_SECURE=true/false` ile değiştirilir |
| `SMTP_USER`, `SMTP_PASSWORD` | Gönderen posta kutusunun kullanıcı adı ve şifresi (uygulama şifresi / API anahtarı) |
| `MAIL_FROM` | Gönderen, örn. `Kanal Doluluk <bildirim@sirket.com>` (sağlayıcının izin verdiği adres) |
| `PUBLIC_URL` | (isteğe bağlı) e-postadaki panel bağlantısı; Render'da `RENDER_EXTERNAL_URL` otomatik kullanılır |
| `NOTIFY_ON` | (isteğe bağlı) virgülle ayrılmış bildirim türleri; varsayılan hepsi: `delete-request,delete-decision,import,import-auto,import-rejected` |
| `NOTIFY_EMAILS` | (isteğe bağlı) hesabı olmayan ek alıcılar; süper-yönetici ve yönetici bildirimlerine eklenir |

**Kime ne gider**

| Olay | Alıcı |
|---|---|
| Yönetici silme talebi açtı (`delete-request`) | Süper-yöneticiler: gerekçe, kapsam, etkilenecek kayıt sayısı |
| Talep onaylandı / reddedildi / süper-yönetici iptal etti (`delete-decision`) | Talebi açan kişi (not dahil) |
| Panelden veri yüklendi (`import`) | Yöneticiler ve süper-yöneticiler (yükleyen hariç): eklenen/güncellenen/atlanan, arşiv toplamı, uyarılar |
| Otomatik (Windows) aktarım tamamlandı (`import-auto`) | Yöneticiler ve süper-yöneticiler: aynı özet, eksik kanal ve saklama uyarısı |
| Otomatik aktarım reddedildi (`import-rejected`) | Süper-yöneticiler: neden ve aralık |

Ekip kullanıcıları bildirim almaz. Alıcının adresi, kullanıcının **E-posta** alanıdır (Kullanıcılar ekranından eklenir/düzenlenir); alan boşsa ve kullanıcı adı e-posta biçimindeyse (`ad@sirket.com`) kullanıcı adı kullanılır. Adresi olmayan kullanıcıya bildirim gitmez. Her alıcıya ayrı ileti gider, adresler birbirini görmez.

**Kurulum:** Render → servis → *Environment* → yukarıdaki değişkenleri ekle → kaydet (servis yeniden başlar). Sonra kendi kişi hesabına e-posta ekleyip **Kullanıcılar → Test e-postası gönder**'e bas. Hata olursa ekranda sunucunun yanıtı görünür (şifre görünmez).

- **Google Workspace:** `smtp.gmail.com`, `465`, kullanıcı = gönderen posta kutusunun tam adresi, şifre = o hesap için üretilmiş **uygulama şifresi** (hesapta 2 adımlı doğrulama açık olmalı ve yönetici konsolunda izin verilmiş olmalı), `MAIL_FROM` aynı adres.
- **SendGrid / Brevo / Resend / Mailgun:** sağlayıcının SMTP bilgilerini gir (örn. SendGrid: `smtp.sendgrid.net`, kullanıcı `apikey`, şifre = API anahtarı); gönderen alan adını sağlayıcıda doğrulamak gerekir.
- **Microsoft 365:** `smtp.office365.com`, `587`; yönetici SMTP AUTH'u o posta kutusu için açmalıdır ve Microsoft temel kimlik doğrulamayı kademeli olarak kapatmaktadır; sorun yaşarsan yukarıdaki sağlayıcılardan birini tercih et.
- Render'ın **ücretsiz** planı SMTP portlarını engeller; ücretli (Pro) planda açıktır.

**Güvenlik ve davranış:** Şifre yalnızca şifreli bağlantıda (465 veya STARTTLS) gönderilir; sunucu şifreli bağlantı sunmazsa kimlik bilgisi hiç gönderilmez ve sertifika doğrulaması kapatılamaz. E-posta hataları işlemi bozmaz: yükleme/silme yine tamamlanır, hata denetim kaydına `E-posta gönderilemedi` olarak yazılır. E-postalara yalnızca özet bilgi ve panel bağlantısı konur; ADEX kayıtları, şifreler veya anahtarlar konmaz. Bildirimler anlık değil sıralı gönderilir (kuyruk 100 ileti ile sınırlıdır).

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

"Donma", aktarım sırasında diğer isteklerin (sayfa açma, filtreleme) beklediği en uzun süredir. Aylık dosyadaki süre XLSX'in ayrıştırılmasından gelir ve arşiv boyutundan bağımsızdır. Tekrar-kontrolü yalnızca gelen dosyanın günleri için yapılır, arşiv parça parça yazılır ve durum değiştiren işlemler (yükleme, kural, geri yükleme) sırayla çalışır. Bu iyileştirmeden önce 1 yıllık arşivde günlük aktarım 5,5 sn, aylık dosya 10,7 sn donduruyordu; tepe bellek 1,7–1,9 GB idi.

Tarayıcı tarafı değişmedi: 1 yıllık arşivde tarayıcı yaklaşık 1,5 GB bellek kullanır ve her açılışta 22 MB iner.

**Render planı:** `render.yaml` **Pro** plan (4 GB RAM) ve `NODE_OPTIONS=--max-old-space-size=3072` ile gelir. Bu planda 3 yıla kadar geçmiş bellekte tutulabilir; 6 aylık varsayılan saklama süresiyle rahat bir marj kalır. 512 MB'lık Starter'da 90 günden uzun geçmiş sunucuyu çökertebilir (`--heap=384` ile ölçüldü).

## Yerel çalıştırma

Node.js 24 ile üç gizli değeri işletim sisteminin ortam değişkenlerinden tanımla; sonra `npm ci` ve `npm start` çalıştır. Yerel adres `http://localhost:3000`, arşiv klasörü varsayılan olarak `data/` olur. Yerel sunucuya internetten erişim açma.

## Geliştirme notları

- Hesaplama çekirdeği tek dosyada: `public/core.js`. Sayfa, Web Worker ve sunucu aynı dosyayı kullanır; testler de bunu çağırır.
- `npm test`: hesaplama birim testleri (`test/core.cjs`), sunucu/yetki/içe aktarım testi (`test/smoke.cjs`) ve Excel çıktısı (`test/export.cjs`). Node 24 gerekir (Render'da `engines` ile sabitlidir).

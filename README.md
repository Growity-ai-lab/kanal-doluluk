# Kanal Doluluk Analizi · TIME

Mevcut web panelinin ortak arşivli sürümü. Filtreler, kanal/reklamveren/marka/ana sektör analizleri, grafikler, ısı haritası ve Excel çıktısı kaynak web sürümünden gelir. Windows masaüstü arayüzünün birebir kopyası değildir.

## GitHub ve Render

1. ZIP'i aç. GitHub'da boş bir **Private** repo oluştur. ZIP'in içindeki dosya ve klasörleri repo köküne yükle; `render.yaml` kökte olmalı. `.gitignore` dosyasını da ekle. Kurulum EXE'sini, ADEX verisini veya şifrelerini repoya yükleme.
2. Render Dashboard'da **New → Blueprint** seç, GitHub reposunu bağla ve ana dalı seç. Blueprint bir **Starter** Web Service ve 1 GB kalıcı disk kurar. Uygulamadan önce ekrandaki güncel bedeli kontrol et.
3. Render istediğinde iki farklı, rastgele, en az 20 karakterli değer gir: `ADMIN_PASSWORD` (acil durum yönetici hesabı) ve `INGEST_TOKEN` (otomatik aktarım). Eski kurulumdaki `TEAM_PASSWORD` artık kullanılmaz; Render'dan silebilirsin. Anahtarları repoya yazma. Render dağıtımından sonra servisin HTTPS adresini aç.
4. Giriş sayfasından kullanıcı adı **admin** ve `ADMIN_PASSWORD` ile gir. Bu acil durum hesabıdır; hemen **Kullanıcılar** ekranından her kişi için ayrı hesap aç (yönetici veya ekip rolü) ve günlük kullanımı kişi hesaplarına bırak. Yönetici veri yükler, kuralları, kullanıcıları ve denetim kaydını yönetir; ekip filtreler ve Excel çıktısı alır.
5. Önce yetkili bir ADEX dışa aktarımıyla paneli dene. Eski masaüstü veritabanı kendiliğinden taşınmaz; geçmişi yüklemek için ADEX kaynak Excel'lerini kullan. Aynı aralığı masaüstü ve webde açıp kanal, spot kapsamı ve doluluk sonuçlarını karşılaştır. Arayüz ve hesap kodu eldeki web sürümüne dayanır; Windows hesaplarıyla birebir sonuç doğrulanmamıştır.

## Kullanıcılar, oturum ve denetim kaydı

- **Hesaplar:** Kişi başına kullanıcı adı ve şifre. Şifreler `scrypt` ile özetlenip `DATA_DIR/users.json` içinde tutulur (en az 12 karakter). Yönetici kullanıcı ekler, şifre sıfırlar, rol değiştirir, hesabı kapatır; herkes kendi şifresini **Şifre** düğmesinden değiştirir. Kendi rolünü veya hesabını değiştirmek engellidir.
- **`admin` hesabı:** `ADMIN_PASSWORD` ile girilen acil durum hesabıdır; şifresi yalnızca Render ortam değişkeninden değişir. Yöneticilerin hepsi hesabını kaybederse buradan toparlanır.
- **Oturum:** İmzalı, `HttpOnly` ve `SameSite=Strict` çerez, 12 saat. İmza anahtarı `DATA_DIR/session.key` dosyasındadır, yeniden dağıtımda oturumlar sürer. Şifre değişince veya hesap kapanınca o kişinin açık oturumları geçersiz olur. Çıkış, çerezi siler.
- **Deneme sınırı:** Aynı kullanıcı adına `LOGIN_MAX_FAILS` (varsayılan 8) başarısız denemeden sonra, aynı IP'den bunun üç katı denemeden sonra 15 dakika giriş kilitlenir. Sayaçlar bellekte tutulur, yeniden başlatmada sıfırlanır.
- **Denetim kaydı:** `DATA_DIR/audit.log` (JSON satırları, 5 MB'ta döner, 10 dosya). Kaydedilenler: giriş, başarısız giriş, çıkış, şifre değişikliği, kullanıcı işlemleri, veri yükleme (kim, mod, aralık, eklenen/güncellenen kayıt), reddedilen yükleme, geri yükleme, kural değişikliği, **Excel çıktısı** (kim, aralık, filtreler) ve yetkisiz deneme. Otomatik aktarım `ingest` adıyla görünür. Şifre ve anahtarlar kayda yazılmaz. Yönetici kaydı **Kullanıcılar** ekranından görür. Excel çıktısı kaydı tarayıcıdan bildirildiği için bir kullanıcı bunu atlatabilir; veriyi kaydın dışında almasını engellemez (bkz. aşağıdaki ham veri notu).
- **Yedek:** `users.json`, `session.key` ve `audit.log` anlık görüntülere dahil değildir; Render disk anlık görüntüsü bunları da kapsar.

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

## Yerel çalıştırma

Node.js 24 ile üç gizli değeri işletim sisteminin ortam değişkenlerinden tanımla; sonra `npm ci` ve `npm start` çalıştır. Yerel adres `http://localhost:3000`, arşiv klasörü varsayılan olarak `data/` olur. Yerel sunucuya internetten erişim açma.

## Geliştirme notları

- Hesaplama çekirdeği tek dosyada: `public/core.js`. Sayfa, Web Worker ve sunucu aynı dosyayı kullanır; testler de bunu çağırır.
- `npm test`: hesaplama birim testleri (`test/core.cjs`), sunucu/yetki/içe aktarım testi (`test/smoke.cjs`) ve Excel çıktısı (`test/export.cjs`). Node 24 gerekir (Render'da `engines` ile sabitlidir).

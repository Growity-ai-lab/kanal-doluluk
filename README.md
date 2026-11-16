# Kanal Doluluk Analizi · TIME

Mevcut web panelinin ortak arşivli sürümü. Filtreler, kanal/reklamveren/marka/ana sektör analizleri, grafikler, ısı haritası ve Excel çıktısı kaynak web sürümünden gelir. Windows masaüstü arayüzünün birebir kopyası değildir.

## GitHub ve Render

1. ZIP'i aç. GitHub'da boş bir **Private** repo oluştur. ZIP'in içindeki dosya ve klasörleri repo köküne yükle; `render.yaml` kökte olmalı. `.gitignore` dosyasını da ekle. Kurulum EXE'sini, ADEX verisini veya şifrelerini repoya yükleme.
2. Render Dashboard'da **New → Blueprint** seç, GitHub reposunu bağla ve ana dalı seç. Blueprint bir **Starter** Web Service ve 1 GB kalıcı disk kurar. Uygulamadan önce ekrandaki güncel bedeli kontrol et.
3. Render istediğinde üç farklı, rastgele, en az 20 karakterli değer gir: `ADMIN_PASSWORD`, `TEAM_PASSWORD`, `INGEST_TOKEN`. Anahtarları repoya yazma. Render dağıtımından sonra servisin HTTPS adresini aç.
4. İlk girişte kullanıcı adı **admin**, şifre `ADMIN_PASSWORD`. Ekip kullanıcı adı **time**, şifre `TEAM_PASSWORD`. Admin veri yükler ve kuralları kaydeder; ekip filtreler ve Excel çıktısı alır. Hesaplar rol başına ortaktır. Rol testinde ayrı tarayıcı profili kullan; tarayıcı temel kimlik doğrulamasını oturum boyunca hatırlayabilir.
5. Önce yetkili bir ADEX dışa aktarımıyla paneli dene. Eski masaüstü veritabanı kendiliğinden taşınmaz; geçmişi yüklemek için ADEX kaynak Excel'lerini kullan. Aynı aralığı masaüstü ve webde açıp kanal, spot kapsamı ve doluluk sonuçlarını karşılaştır. Arayüz ve hesap kodu eldeki web sürümüne dayanır; Windows hesaplarıyla birebir sonuç doğrulanmamıştır.

## Veri ve yetkiler

- Ortak arşiv Render diskinin `/var/data/archive.json.gz` dosyasında tutulur; tek servis örneği kullan. Panel ve veri uç noktaları kimlik doğrulaması ister, yalnızca `/healthz` herkese açıktır.
- Filtre ve Excel hesabı tarayıcıda yapıldığı için **giriş yapabilen ekip kullanıcılarına ADEX satırları da iletilir**. Ham veriyi görmeye yetkisi olmayan kullanıcılara ekip girişini verme. Müşteriye açık veya yalnızca özet veri sunan bir sürüm için bu paketi olduğu gibi kullanma.
- Admin mevcut tarayıcıdaki ADEX içe aktarımını ortak arşive yapar. Bir ekip üyesi değişiklikleri sayfayı yenileyerek görür.
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

## Yerel çalıştırma

Node.js 24 ile üç gizli değeri işletim sisteminin ortam değişkenlerinden tanımla; sonra `npm ci` ve `npm start` çalıştır. Yerel adres `http://localhost:3000`, arşiv klasörü varsayılan olarak `data/` olur. Yerel sunucuya internetten erişim açma.

## Geliştirme notları

- Hesaplama çekirdeği tek dosyada: `public/core.js`. Sayfa, Web Worker ve sunucu aynı dosyayı kullanır; testler de bunu çağırır.
- `npm test`: hesaplama birim testleri (`test/core.cjs`), sunucu/yetki/içe aktarım testi (`test/smoke.cjs`) ve Excel çıktısı (`test/export.cjs`). Node 24 gerekir (Render'da `engines` ile sabitlidir).

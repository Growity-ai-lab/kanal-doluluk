# 📋 Deploy Kontrol Listesi

Bu dosya, Supabase + Vercel deployment adımlarını takip etmek için kullanılır.

## AŞAMA 1: SUPABASE KURULUMU ✅

- [ ] Supabase hesabı oluştur (supabase.com)
- [ ] Yeni proje oluş: `kanal-doluluk`
- [ ] Database password ayarla
- [ ] Region seç (tr-istanbul ya da eu-west)
- [ ] Projenin tamanlandığını bekle (2-3 dakika)

## AŞAMA 2: STORAGE BUCKET ✅

- [ ] Supabase Dashboard → Storage açılır
- [ ] "Create a new bucket" tıkla
- [ ] Bucket adı: `kanal-doluluk`
- [ ] "Public bucket" seçili ✓
- [ ] Bucket oluştur

## AŞAMA 3: API KEYS ✅

- [ ] Supabase Dashboard → Settings → API
- [ ] **Project URL** kopyala
  - Format: `https://xxxxx.supabase.co`
  - Bunu `.env`'de `VITE_SUPABASE_URL` olarak kullan
- [ ] **Service Role Key** ya da **anon public key** kopyala
  - Bunu `.env`'de `VITE_SUPABASE_ANON_KEY` olarak kullan

## AŞAMA 4: EXCEL DOSYASINI UPLOAD ET ✅

- [ ] Güncel Excel dosyasını hazırla (örn: `kanal-doluluk.xlsx`)
- [ ] Supabase Storage → `kanal-doluluk` bucket
- [ ] "Upload file" tıkla
- [ ] Excel dosyasını seç → Upload
- [ ] Dosya listesinde görün

## AŞAMA 5: LOCAL `.env` DOSYASI ✅

```bash
# Proje root'unda terminalde:
cp .env.example .env
```

Sonra `.env` dosyasını text editörle aç ve doldur:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

- [ ] `.env` dosyası dolduruldu
- [ ] Local test: `npm run dev` → App açılıp "Veriyi Yenile" çalışıyor

## AŞAMA 6: GITHUB'A PUSH ✅

Terminal'de proje root'unda:

```bash
git config --global user.name "Adın"
git config --global user.email "sifre@email.com"
```

(İlk kez yapıyorsan, yoksa atla)

```bash
git add .
git commit -m "feat: Supabase integration for shared Excel analytics"
git branch -M main
git remote add origin https://github.com/your-username/kanal-doluluk.git
git push -u origin main
```

- [ ] GitHub hesabı oluşturuldu
- [ ] Repository oluşturuldu
- [ ] Kod GitHub'a push edildi

## AŞAMA 7: VERCEL DEPLOY ✅

1. [vercel.com](https://vercel.com) git, **GitHub ile login**
2. **"New Project"** tıkla
3. `kanal-doluluk` repository seç → **Import**
4. Framework: **React**
5. Root Directory: `.`
6. "Environment Variables" section'unda **ADD** tıkla:

   | Key | Value |
   |-----|-------|
   | `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` |

7. Her iki variable için **Save** tıkla
8. **Deploy** butona tıkla
9. Build başlasın, 2-3 dakika bekle

- [ ] Vercel'de GitHub auth yapıldı
- [ ] Proje import edildi
- [ ] Environment variables eklendi
- [ ] Deploy tamamlandı

## AŞAMA 8: VERCEL URL ALINDI ✅

Deploy sonrası Vercel sana URL verecek:

```
https://kanal-doluluk.vercel.app
```

- [ ] Production URL kopyalandı
- [ ] URL açıldı ve app yüklendi
- [ ] "Veriyi Yenile" butonu tıklandı
- [ ] Veriler göründü

## AŞAMA 9: KULLANICILAR BILGILENDIR ✅

- [ ] 6-7 kişiye URL gönder
- [ ] "Veriyi Yenile" butonundan bahset
- [ ] Haftalık Excel updatelerini anlat

## AŞAMA 10: HAFTALIK GÜNCELLEME SÜRECİ ✅

Her hafta (örn. her Cuma):

1. Yeni Excel veriyle doldur
2. `YYYY-MM-DD_kanal_doluluk.xlsx` adıyla kaydet
3. Supabase Storage → `kanal-doluluk` → Upload
4. Slack/Email gönder: "Yeni veri yüklendi, 'Veriyi Yenile' butonuna basın"
5. Herkeste otomatik senkron olur ✅

---

## ⏱️ TOPLAM ZAMAN

| Aşama | Zaman |
|-------|-------|
| 1. Supabase Kurulumu | 5 dk |
| 2. Storage Bucket | 2 dk |
| 3. API Keys | 2 dk |
| 4. Excel Upload | 1 dk |
| 5. .env Setup | 2 dk |
| 6. GitHub Push | 3 dk |
| 7. Vercel Deploy | 5-10 dk |
| 8. URL Test | 2 dk |
| **TOPLAM** | **~25-30 dakika** |

---

## 🆘 YAYGINN HATALAR

### "VITE_SUPABASE_URL not defined"
- Çözüm: Vercel'de Environment Variables'da URL ekleyip mi kontrol et
- `.env` dosyanın syntax'ı tamam mı kontrol et

### "Excel bulunamadı"
- Supabase bucket'ta dosya var mı kontrol et
- Dosya adı doğru mu kontrol et
- Public bucket seçili mi kontrol et

### "Vercel build hatası"
- Terminal'de `npm run build` çalıştırıp hataya bak
- Hata varsa fix et + GitHub push → Vercel otomatik retry

### ".env şifresi git push oldu"
- `.gitignore` kontrol et, `.env` satırı var mı diye
- GitHub'dan sil: `git rm --cached .env` + push

---

## ✅ TAMAMLANDI

Tüm adımlar biterse:
- ✅ App erişilebilir (Vercel URL)
- ✅ Ortak veri görünüyor
- ✅ 6-7 kişi aynı excel'i kullanıyor
- ✅ Haftalık update workflow çalışıyor

---

**Herhangi bir sorun? Lütfen hangi adımda sıkıştığını yazın!**

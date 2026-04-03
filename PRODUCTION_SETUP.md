# Üretim Ortamı Kurulumu (Production Setup)

## 🚀 Vercel'de Uygulamayı Çalıştırma

Uygulamanın Vercel'de düzgün çalışması için **iki** veri kaynağından biri **mutlaka** yapılandırılmalıdır:

---

## ✅ Seçenek 1: Supabase Kullanımı (Önerilen)

### Adım 1: Vercel'de Environment Variables'ı Ayarla

1. [Vercel Dashboard](https://vercel.com) → Projenizi seçin
2. **Settings** → **Environment Variables** tıklayın
3. Aşağıdaki iki değişkeni ekleyin:

| Anahtar | Değer | Açıklama |
|---------|-------|---------|
| `VITE_SUPABASE_URL` | `https://tjshjsljnwsauhmgtbsr.supabase.co` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` | Supabase Aç API Anahtarı |

4. **Save** butonuna basın
5. **Deployments** sekmesine gidin ve **Redeploy** tıklayın

### Adım 2: Supabase'de Veri Hazırlığı

1. [Supabase Console](https://app.supabase.com) açın
2. Projenize gidin → **Storage** sekmesi
3. Bucket adı: `kanal-doluluk` (varsa, yoksa oluşturun)
4. `kanal-doluluk.xlsx` dosyasını upload edin

**Sonra:** Uygulamada "Veriyi Güncelle" butonuna basın

---

## 🟡 Seçenek 2: Statik Fallback Dosyası Kullanımı

Supabase yoksa, yerel fallback Excel dosyasını kullanabilirsiniz.

### Adım 1: Excel Dosyasını Hazırla

1. Güncel `kanal-doluluk.xlsx` dosyasını bulun (kolonda: `Tarih, Kanal, Doluluk, ...`)
2. Bu dosyayı **tamamen** kopyalayın

### Adım 2: GitHub'a Yükle

```bash
# Lokal ortamda (terminal):
cp /path/to/kanal-doluluk.xlsx public/data/kanal-doluluk.xlsx

git add public/data/kanal-doluluk.xlsx
git commit -m "Add default fallback Excel data"
git push origin main
```

### Adım 3: Vercel'da Redeploy

1. Vercel Dashboard → Deployments
2. **Redeploy** tıklayın (otomatik olacak)
3. Build tamamlandıktan sonra siteyi yenileyin

**Not:** Git tarafından geçişli olmadığından, `.gitignore` dosyasında `public/data/*.xlsx` yoksa dosya push edilecektir.

---

## ⚠️ Hata Mesajı: "Fallback Excel dosyası bulunamadı"

Bu hata şu durumlarda görülür:

| Durum | Çözüm |
|-------|-------|
| Supabase env vars set değil | **Seçenek 1** → Vercel env vars ekle |
| `public/data/kanal-doluluk.xlsx` yok | **Seçenek 2** → Dosyayı Git'e ve upload et |
| Her ikisi de yok | İkisinden birini yapılandır |

---

## 🔍 Sorun Giderm: Console Logları

1. Vercel'de siteyi açın
2. **F12** → **Console** sekmesi
3. Aşağıdaki logları kontrol edin:

```
✅ Başarılı:
📡 Loading from Supabase...
✅ Data processed: { rating: 150, occupancy: 150 }

❌ Başarısız:
⚠️ Supabase not enabled - falling back to local data
🔗 Attempting to load remote data from: https://kanal-doluluk.vercel.app/data/kanal-doluluk.xlsx
⚠️ Remote file not found (404). Fallback Excel file not deployed.
```

---

## 📋 Kontrol Listesi

- [ ] Vercel'de `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` set mi?
- [ ] Supabase bucket `kanal-doluluk` de Excel dosyası var mı?
- [ ] Ya da `public/data/kanal-doluluk.xlsx` Git'e push edildi mi?
- [ ] Vercel redeploy tamamlandı mı?
- [ ] Browser F12 console'da hata yok mu?

Tüm kontrol listeleri tamamsa, app çalışmalıdır! 🎉

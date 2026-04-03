# Vercel Setup Rehberi

## 🚀 Adım 1: Supabase ANON KEY'i Bulma

1. **Supabase Console'u açınız**: https://app.supabase.com
2. Projenizi seçiniz: `kanal-doluluk-project`
3. **Settings** → **API** sekmesine gidiniz
4. **Project URL** ve **Aç anon public** başlığı altında:
   - `Project URL`: `https://tjshjsljnwsauhmgtbsr.supabase.co` (zaten var)
   - `anon public`: Buradan ANON KEY'i kopyalayınız (uzun string, `eyJ...` ile başlar)

---

## 📋 Adım 2: Vercel Environment Variables'ı Ayarlama

1. **Vercel Dashboard'a gidiniz**: https://vercel.com/dashboard
2. **kanal-doluluk** projesini seçiniz
3. **Settings** sekmesine tıklayınız
4. Sol menüde **Environment Variables** tıklayınız
5. Aşağıdaki değişkenleri ekleyiniz:

### Environment Variable 1:
```
Key: VITE_SUPABASE_URL
Value: https://tjshjsljnwsauhmgtbsr.supabase.co
Environment: Production, Preview, Development
```
→ **Save** butonuna basınız

### Environment Variable 2:
```
Key: VITE_SUPABASE_ANON_KEY
Value: [Supabase'ten kopyalanan ANON KEY]
Environment: Production, Preview, Development
```
→ **Save** butonuna basınız

---

## 🔄 Adım 3: Vercel'de Redeploy

1. **Deployments** sekmesine gidiniz
2. En son deployment'ın sağında **...** (üç nokta) tıklayınız
3. **Redeploy** seçiniz
4. Build tamamlanması için bekleyiniz (~2-3 dakika)

---

## ✅ Adım 4: Test Etme

1. **Siteyi açınız**: https://kanal-doluluk.vercel.app
2. **F12** tuşuna basarak Developer Tools açınız
3. **Console** sekmesine gidiniz
4. Aşağıdaki logları kontrol ediniz:

### Başarılı ise göreceğiniz loglar:
```
✅ Loading from Supabase...
✅ Files found: [sayı]
✅ Data processed: { rating: X, occupancy: Y }
✅ Supabase data loaded successfully
```

### Hata ise göreceğiniz loglar:
```
❌ Supabase not enabled - falling back to local data
❌ No files in Supabase bucket
❌ Supabase load error: ...
```

---

## 🔧 Sorun Giderna

### **Hata: "Supabase not enabled"**
- ✅ *Çözüm*: Environment variables'ı kontrol edin
- Vercel Settings → Environment Variables'da her iki variable var mı?
- Redeploy ettiniz mi? (değişiklikler pushlama gerekir)

### **Hata: "No files in Supabase bucket"**
- ✅ *Çözüm*: Supabase bucket'ında Excel dosyası yükleyin
  1. https://app.supabase.com → Projects → kanal-doluluk
  2. **Storage** sekmesi
  3. `kanal-doluluk` bucket'ında `kanal-doluluk.xlsx` dosyası var mı?
  4. Yoksa upload ediniz

### **Hata: "Cannot GET /"**
- ✅ *Çözüm*: Base path sorunu (zaten düzeltildi)
- vite.config.js'de `base: '/'` olduğundan emin olun

---

## 📊 Vercel Deployment Kontrol Listesi

- [ ] GitHub'da son commit'ler `main` branch'inde var mı?
- [ ] Vercel Settings'de `VITE_SUPABASE_URL` set mi?
- [ ] Vercel Settings'de `VITE_SUPABASE_ANON_KEY` set mi?
- [ ] Redeploy tetiklendi mi?
- [ ] Build başarılı mı?
- [ ] Console'da loglar gösteriliyor mu?
- [ ] Supabase bucket'ında dosya var mı?

---

## 🎯 İleri Adımlar

Vercel çalışıp çalışmadığını doğruladıktan sonra:

1. **cron job** kur → Haftalık Excel güncellemeleri otomatik
2. **Custom domain** ekle (isteğe bağlı)
3. **Analytics** aktifleştir (isteğe bağlı)
4. **6-7 kullanıcıya** URL gönder

---

**Sorular varsa rehberi adım adım takip edebilirsiniz!**

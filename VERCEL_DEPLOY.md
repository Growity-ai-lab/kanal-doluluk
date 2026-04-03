# 🚀 VERCEL DEPLOYMENT - SON ADIM

Supabase anahtarlarınız hazır, GitHub push tamamlandı. Artık Vercel'e deploy edin!

## ⚡ HEMEN YAPMANIZ GEREKENLER

### 1. Vercel'e Giriş
https://vercel.com → GitHub ile login

### 2. Projeyi Import Et
- **"New Project"** tıkla
- `kanal-doluluk` repository seç
- **"Import"** tıkla

### 3. Build Settings
- **Framework Preset:** React (otomatik olacak)
- **Root Directory:** `.`
- Diğer ayarlar default kalabilir

### 4. 🔑 ENVIRONMENT VARIABLES (ÖNEMLİ!)

**"Environment Variables"** bölümüne aşağıdaki iki satırı ekle:**Var 1:**
```
Key: VITE_SUPABASE_URL
Value: https://tjshjsljnwsauhmgtbsr.supabase.co
```

**Var 2:**
```
Key: VITE_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqc2hqc2xqbndzYXVobWd0YnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMDUwOTIsImV4cCI6MjA5MDc4MTA5Mn0.7gWzUKEKKkod7NUUzR2TIhUzd__zgR-EwgU-w5cw7Wg
```

Her iki değerin sağında **"Save"** tıkla!

### 5. Deploy!
- **"Deploy"** butonuna tıkla
- Build başlasın, 2-3 dakika bekle
- ✅ "Production" durumuna gelinceDeployment tamamlandı!

---

## 📍 SONUÇ URL

Deploy tamamlandıktan sonra Vercel size bunun gibi bir URL verecek:

```
https://kanal-doluluk.vercel.app
```

**Bu linki 6-7 kişiye gönder!** 🎉

---

## ✅ KULLANICILAR İÇİN INSTRUCTIONS

Her kullanıcıya şu bilgileri ver:

```
Herkese açılan link: https://kanal-doluluk.vercel.app

- Sayfayı aç
- "Merkezi Veri Kaynağı" kartında "Veriyi Yenile" butonuna bas
- Tablolarda veriler göründü mü?
- Grafikleri ve detayları inceleyebilirsin

Haftada bir kez yeni veriler yüklenir. 
Bu durumda "Veriyi Yenile" butonuna tekrar bass!
```

---

## 🛠️ Sorun Çıkarsa

| Sorun | Çözüm |
|-------|-------|
| Build Error | Terminal'de `npm run build` çalıştırıp hataya bak |
| "Cannot find module" | Supabase ANON_KEY değerini kontrol et |
| "Excel not found" | Supabase'te kanal-doluluk bucket'ta dosya var mı bak |

---

**Deploy tamamlandı mı? Tay! Herkes artık Excel analizi yapabilir! 🎊**

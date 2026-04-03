# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

# Kanal Doluluk Analizi Platformu

Merkezi Excel dosya yönetimi ve ortak veri analizi platformu.
**6-7 kullanıcı, farklı bilgisayarlardan aynı veriyi görebilir.**

## 🚀 Hızlı Başlangıç

### Yerel Development

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` açılacak.

### Production Build

```bash
npm run build
npm run preview
```

---

## 📊 Mimarı

- **Frontend:** React + Vite
- **Storage:** Supabase (merkezi Excel dosya deposu)
- **Lokal Cache:** IndexedDB
- **Deploy:** Vercel / Render

---

## ⚙️ Supabase Kurulumu

### 1. Supabase Projesi Oluştur

1. [supabase.com](https://supabase.com) git, **Login** yap
2. **"New Project"** tıkla
3. Proje adı: `kanal-doluluk`
4. Database password ayarla
5. Region seç (en yakın: tr-istanbul vs eu-west)
6. **Create** tıkla (2-3 dakika bekle)

### 2. Storage Bucket

1. Supabase dashboard → **Storage** → **"Create a new bucket"**
2. Bucket adı: `kanal-doluluk`
3. **"Public bucket"** seç ✓
4. **Create** tıkla

### 3. API Keys

1. **Settings** → **API** aç
2. **"Project URL"** kopyala → `.env` dosyasına `VITE_SUPABASE_URL`
3. **"Service Role Key"** ya da **"anon public key"** kopyala → `.env` dosyasına `VITE_SUPABASE_ANON_KEY`

### 4. `.env` Dosyası Oluştur

Projenin root'unda `.env` dosyası oluştur:

```bash
cp .env.example .env
```

Sonra `.env` dosyasını açıp değerleri doldur:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### 5. İlk Excel Dosyasını Upload Et

1. Supabase → Storage → **kanal-doluluk** bucket
2. **"Upload file"** tıkla
3. Hazır olan Excel dosyasını seç (örn: `kanal-doluluk.xlsx`)
4. Upload tamamlanınca, dosya listesinde görülmeli

---

## 🌐 Vercel'e Deploy

### 1. GitHub'a Push

```bash
git add .
git commit -m "feat: Supabase integration for shared Excel analytics"
git branch -M main
git remote add origin https://github.com/your-username/kanal-doluluk.git
git push -u origin main
```

### 2. Vercel'de Deploy

1. [vercel.com](https://vercel.com) git, GitHub ile login
2. **"New Project"** → `kanal-doluluk` repo seç
3. **Import** tıkla
4. Framework: **React** seç (otomatik)
5. **Environment Variables** section'unda ekle:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Public Anon Key |

6. **Deploy** tıkla

### 3. Public URL

Deploy sonrası Vercel size URL verecek:
```
https://kanal-doluluk.vercel.app
```

Bu linki 6-7 kişiye gönder! 🎉

---

## 📅 Haftalık Güncelleme

Her hafta yeni Excel dosyası:

1. Güncel verileri Excel'e gir
2. `YYYY-MM-DD_kanal_doluluk.xlsx` adıyla kaydet
3. Supabase Storage → `kanal-doluluk` → Upload
4. Kullanıcılar uygulamada **"Veriyi Yenile"** butonuna basarlar
5. Yeni veri herkeste otomatik senkron olur

---

## 🔧 Geliştirme

### Yeni Feature Eklemek

1. El kalem kodu yazıp `npm run dev`'de test et
2. Lint kontrol et: `npm run lint`
3. Build kontrol et: `npm run build`
4. Git push → Vercel otomatik redeploy

### Build Boyutu Uyarısı

Build'de `"chunks are larger than 500 kB"` uyarısı normaldi (PWA + xlsx lib). İhmal et.

---

## 📝 Lisans

Kanal Doluluk Analizi © 2026

---

## 🆘 Sorunlar

| Sorun | Çözüm |
|-------|-------|
| "Supabase connection error" | `.env` değerlerini kontrol et, Supabase dashboard'dan yeniden kopyala |
| "Excel bulunamadı" | Supabase'te bucket'ta dosya var mı kontrol et |
| "Vercel build hatası" | Terminal'de `npm run build` çalıştırıp hata mesajına bak |
| "Şifreli .env push oldu" | `.gitignore` kontrol et, dosya gitignore'da mı |

---

**Tüm adımlar tamamlandı mı? `npm run dev` komutuyla başla!**


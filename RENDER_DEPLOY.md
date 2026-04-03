# Render.com Pro'da Deployment Rehberi

## 🚀 Neden Render.com?

Render.com Pro hesabınızla Vercel'e ek olarak backup/staging ortamı oluşturabilirsiniz:

| Özellik | Render.com | Vercel |
|---------|-----------|--------|
| Uyku Modu | ❌ Yok (Pro) | ⏸️ Var |
| Build Süresi | 5-10 saniye | 2-3 saniye |
| Startup | Hızlı (Pro) | Çok hızlı |
| Ideal Kullanım | Backup/Staging | Production |

---

## 📋 Kurulum Adımları

### Adım 1: Render.com'da Hesap Hazırlığı

1. [render.com](https://render.com) açın → **Dashboard**
2. **+ New** → **Web Service** tıklayın
3. **Public Git Repository** seçin

### Adım 2: GitHub Bağlantısı

1. Bağlantı URL'si girin:
   ```
   https://github.com/Growity-ai-lab/kanal-doluluk.git
   ```
2. Render sizden yetki isteyecek → Onaylayın
3. Branch seçin: `main`

### Adım 3: Hizmet Ayarları

| Alan | Değer |
|------|-------|
| **Name** | `kanal-doluluk` |
| **Environment** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run preview` (test için) |
| **Region** | Istanbul (ör. Frankfurt) |

### Adım 4: Environment Variables

**Settings** → **Environment** sekmesinde ekleyin:

```
VITE_SUPABASE_URL=https://tjshjsljnwsauhmgtbsr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### Adım 5: Deploy

1. **Deploy** butonuna basın
2. Build loglarını izleyin
3. Tamamlandıktan sonra URL: `https://kanal-doluluk.onrender.com`

---

## ✅ Post-Deploy Kontrol

```bash
# 1. Site açılıyor mu?
https://kanal-doluluk.onrender.com

# 2. Console hatasız mı?
F12 → Console → No errors

# 3. Veriler yükleniyor mu?
"Supabase data loaded successfully" (console)
```

---

## 🔄 Vercel + Render Setup (İki Ortam)

```
GitHub (kanal-doluluk)
    ├─ Push → Vercel (Üretim) [2 sn build]
    └─ Push → Render (Staging) [5 sn build]

URLs:
├─ Üretim: https://kanal-doluluk.vercel.app
└─ Staging: https://kanal-doluluk.onrender.com

Her push'ta her ikisi de otomatik deploy olur
```

---

## 💡 İpucu: Aradığınız Avantajlar?

### Render.com Pro Neden Tercih Edilir?
- ✅ **Uyku modu yok** (always-on)
- ✅ **Paralel deploylar**
- ✅ **Private databases support**
- ✅ **Custom domains**

### Bu Proje İçin İhtiyaç?
- 🟢 **Üretim**: Vercel (hızlı frontend)
- 🟡 **Backup**: Render (yedek URL)
- 🟡 **Staging**: Render (test ortamı)

---

## ⚙️ Render Pro Özellikleri Kullanımı

```yaml
# render.yaml dosyası (isteğe bağlı)
services:
  - type: web
    name: kanal-doluluk
    env: node
    plan: pro  # Pro özelliklerini kullan
    buildCommand: npm install && npm run build
    startCommand: npm run preview
    envVars:
      - key: VITE_SUPABASE_URL
        value: https://tjshjsljnwsauhmgtbsr.supabase.co
```

---

## 🛑 Sorun Gidernme

| Hata | Çözüm |
|------|-------|
| Build failed | `npm install` çalıştırıp local'de test edin |
| 404 errors | Environment variables set değil |
| Slow loading | Region değiştirin veya Pro upgrade |
| Uyku modu | Pro plan'e upgrade edin |

---

## 📞 İletişim & Support

- Render Support: https://support.render.com
- Documentation: https://render.com/docs

**Her zaman Vercel'i öncelikli tutun, Render'ı backup olarak kullanın.**

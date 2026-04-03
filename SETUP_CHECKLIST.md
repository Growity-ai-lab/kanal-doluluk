# ✅ Kurulum Kontrol Listesi

Bu listeyi takip ederek adım adım deployment'ı tamamla.

## 1️⃣ SUPABASE HAZIRLIĞI (10 dakika)

Ziyaret et: https://supabase.com/dashboard

- [ ] Yeni proje oluşturdun: `kanal-doluluk`
- [ ] Database password ayarladın
- [ ] Proje sekmesi açıldı
- [ ] Storage → Create Bucket → `kanal-doluluk` (Public)
- [ ] Settings → API → Project URL kopyaladın
- [ ] Settings → API → anon public key kopyaladın

**Kopyaladığın değerler:**
```
VITE_SUPABASE_URL = https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGc...
```

## 2️⃣ LOCAL SETUP (5 dakika)

Terminal'de:

```bash
cd "/Users/b.z.k/Desktop/T&G/Internal Araçlar/Kanal Doluluk/kanal-doluluk-analizi-win32-x64/kanal-doluluk"

# .env dosyası oluştur
cp .env.example .env

# .env dosyasını aç ve yukarıdaki değerleri kopyala
# (VS Code'da Ctrl+P: ".env" yaz → Enter)
```

`.env` dosyanızın içi:
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

- [ ] `.env` dosyası oluşturuldu
- [ ] Supabase değerleri dolduruldu

## 3️⃣ LOCAL TEST (2 dakika)

Terminal'de:

```bash
npm run dev
```

- [ ] App lokalde açıldı (http://localhost:5173)
- [ ] "Merkezi Veri Kaynağı" kartı görünüyor
- [ ] "Veriyi Yenile" butonuna tıkla
- [ ] Supabase'ten veriler yüklendi

## 4️⃣ EXCEL UPLOAD (1 dakika)

- [ ] Supabase Storage → `kanal-doluluk` bucket
- [ ] "Upload file" → Excel dosyasını seç
- [ ] Yüklendi

## 5️⃣ GITHUB (5 dakika)

Terminal'de:

```bash
git config --global user.name "Adın"
git config --global user.email "e@mail.com"

# İlk kez yaparsan; varsa atla

git add .
git commit -m "feat: Supabase integration for shared Excel analytics"
git branch -M main
git remote add origin https://github.com/username/kanal-doluluk.git
git push -u origin main
```

- [ ] GitHub hesabı var
- [ ] Repository oluşturuldu
- [ ] Kod push edildi

## 6️⃣ VERCEL (10 dakika)

1. https://vercel.com git → GitHub ile login
2. New Project → `kanal-doluluk` → Import
3. Framework: React (auto)
4. **Environment Variables:**

| Key | Value |
|-----|-------|
| VITE_SUPABASE_URL | https://xxxxx.supabase.co |
| VITE_SUPABASE_ANON_KEY | eyJhbGc... |

5. Deploy

- [ ] Vercel sitesine gittim
- [ ] GitHub ile login yapıldı
- [ ] Repository import
- [ ] Env variables eklendi
- [ ] Deploy tıklandı
- [ ] Build tamamlandı (✓ completed)

## 7️⃣ CANLIYA ÇIKTI ✅

Vercel sana bu formatta URL verecek:
```
https://kanal-doluluk.vercel.app
```

- [ ] URL açıldı
- [ ] App yüklendi
- [ ] "Veriyi Yenile" → Veriler göründü
- [ ] 6-7 kişiye URL göndereyim

---

## 🔄 HAFTALIK WORKFLOW

Her hafta (örn. Cumartesi gece):

1. Excel'e yeni veri gir
2. Supabase → Storage → Upload et (`2026-04-10_kanal.xlsx` gibi)
3. Slack/Email: "Yeni veri yüklendi, 'Veriyi Yenile' butonuna basın"
4. Herkes yenileme yaptığında yeni veri görünür ✅

---

## 🆘 YAYGINN SORUNLAR

| Sorun | Çözüm |
|-------|-------|
| "Connection error" | `.env` değerlerini Supabase'ten yeniden kopyala |
| "Excel bulunamadı" | Supabase bucket'ta dosya var mı kontrol et |
| "Vercel build hatası" | Terminal'de `npm run build` çalıştırıp hatayı oku |
| ".env git push oldu" | `.gitignore` kontrol et, `.env` satırı var mı |

---

**Tüm adımları tamamladınız mı? Harika! URL'i herkes kullanabilir. 🎉**

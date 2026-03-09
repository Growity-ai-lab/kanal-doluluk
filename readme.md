# 🖥️ Kanal Doluluk Analizi - Desktop App

## ✅ Tamamen Yerel Çalışan Uygulama

**Özellikler:**
- ✅ MongoDB gerektirmez (JSON dosya tabanlı)
- ✅ Internet gerektirmez (tamamen offline)
- ✅ Tek klasör yapısı (taşınabilir)
- ✅ Node.js + Electron
- ✅ Otomatik backend başlatma

---

## 🚀 Kurulum

### 1. Node.js Yükleyin

Eğer yüklü değilse: https://nodejs.org/

### 2. Bağımlılıkları Yükleyin

```bash
cd desktop
npm install
```

veya

```bash
yarn install
```

### 3. Uygulamayı Başlatın

```bash
npm start
```

veya

```bash
yarn start
```

---

## 📦 Executable Oluşturma

### Windows için:
```bash
npm run build:win
```

### Mac için:
```bash
npm run build:mac
```

### Linux için:
```bash
npm run build:linux
```

Oluşan dosya: `dist/` klasöründe

---

## 📂 Dosya Yapısı

```
desktop/
├── index.html          # Frontend UI
├── main.js             # Electron ana dosyası (backend'i başlatır)
├── server.js           # Node.js backend (JSON storage)
├── package.json        # Bağımlılıklar
├── data.json          # Veri dosyası (otomatik oluşur)
└── README.md          # Bu dosya
```

---

## 🎯 Nasıl Çalışır?

1. **npm start** komutu çalıştırılır
2. **main.js** başlar
3. **server.js** otomatik başlatılır (port 8001)
4. **Electron penceresi** açılır
5. **index.html** yüklenir
6. Uygulama kullanıma hazır!

---

## 💾 Veri Depolama

**data.json** dosyasında saklanır:
- Tüm Excel kayıtları
- Doluluk hesaplamaları
- Kümülatif veri

**Veri Temizleme:**
- Uygulama içinden "Verileri Temizle" butonu
- Veya data.json dosyasını silin

---

## ✨ Özellikler

✅ **Kümülatif Veri** - Yeni Excel'ler eski verilere eklenir
✅ **Mükerrer Kontrol** - Aynı kayıt tekrar etmez
✅ **Offline Çalışma** - Internet gerekmez
✅ **Taşınabilir** - Klasörü kopyalayın, başka bilgisayarda çalıştırın
✅ **JSON Storage** - MongoDB gerektirmez
✅ **Otomatik Backend** - main.js backend'i başlatır

---

## 🐛 Sorun Giderme

### "Error" mesajı alıyorum

1. Node.js yüklü mü kontrol edin:
```bash
node --version
```

2. Bağımlılıkları tekrar yükleyin:
```bash
rm -rf node_modules
npm install
```

3. Port 8001 kullanımda mı?
```bash
# Windows
netstat -ano | findstr :8001

# Mac/Linux
lsof -i :8001
```

### Uygulama açılmıyor

```bash
npm start -- --trace-warnings
```

Komutu çalıştırıp hata mesajlarına bakın.

### data.json bulunamıyor

Otomatik oluşur. Oluşmadıysa:

```json
{
  "ratingData": [],
  "occupancyData": []
}
```

Bir `data.json` dosyası oluşturun.

---

## 📋 Gereksinimler

- Node.js >= 18.0.0
- npm veya yarn
- Windows / Mac / Linux

---

## 🎉 Avantajlar

| Özellik | Bu Versiyon | Önceki Versiyon |
|---------|-------------|------------------|
| MongoDB | ❌ Gereksiz | ✅ Gerekli |
| Python | ❌ Gereksiz | ✅ Gerekli |
| Internet | ❌ Gereksiz | ⚠️ İsteğe bağlı |
| Kurulum | ✅ Kolay | ⚠️ Karmaşık |
| Taşınabilir | ✅ Evet | ❌ Hayır |
| Dosya Yapısı | ✅ Tek klasör | ⚠️ Çoklu klasör |

---

**Artık tamamen yerel çalışan, taşınabilir bir uygulama!** 🚀

© 2026 Kanal Doluluk Analizi

# BlockWorld (Alpha) 🎮

**BlockWorld** adalah game 2D 2D Multiplayer Sandbox berbasis Web yang terinspirasi dari gabungan mekanik game *Growtopia* dan *Terraria*. Game ini dibangun menggunakan **Node.js**, **Express**, **Socket.IO**, dan **HTML5 Canvas** murni tanpa *framework game engine* berat.

---

## ✨ Fitur Utama

- **🌍 Generasi Dunia Alami (Procedural Generation):** Dunia dengan bukit rumput bergelombang, pohon alami, lapisan tanah & batu, serta endapan es & lava di kedalaman tanah.
- **🌞/🌙 Siklus Siang & Malam (Day/Night Cycle):** Siklus 2 menit (1 menit Siang, 1 menit Malam) dengan efek gradasi langit dinamis, pergerakan Matahari & Bulan, serta bintang berkedip di malam hari.
- **⚔️ Musuh Knight & Combat System:** 
  - Prajurit Knight berzirah yang bermunculan khusus saat malam hari.
  - Sistem bertarung dengan Tangan Kosong (*Fist* - 1 DMG), *Wooden Sword* (3 DMG), dan *Stone Sword* (5 DMG).
  - Prajurit Knight otomatis terbakar/lenyap saat matahari pagi terbit.
- **🛠️ Sistem Crafting & Inventory:**
  - Tas Inventory dengan sistem **Tab** (*Blocks*, *Backgrounds*, *Deadly*, *Weapons*, dan *Crafting*).
  - Crafting Table untuk merakit bahan (Tembok Padat, Pintu Wood, Senjata).
  - Hotbar 5 slot di layar bawah.
- **💎 Item Drop & Auto-Pickup:** Blok yang dihancurkan akan membal di tanah sebelum dipungut saat didekati. Tombol `G` untuk membuang item secara manual.
- **🛡️ Mode Admin / Moderator:** Kekuatan khusus moderator (`/loginadmin admin123`) yang memberikan fitur Terbang (`/fly`), Bebas Tembus (`/noclip`), Kebal Serangan Musuh, dan Tanpa Limit Jangkauan Bangun.

---

## 🛠️ Teknologi yang Digunakan

- **Backend:** Node.js, Express.js
- **Real-time Multiplayer:** Socket.IO
- **Frontend / Graphics:** HTML5 Canvas (Procedural Pixel Art Renderers)
- **Styling:** Vanilla CSS (Glassmorphism UI)

---

## 🚀 Cara Menjalankan Project

### Persyaratan:
- [Node.js](https://nodejs.org/) (versi 14 atau yang terbaru)

### Langkah-langkah:

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/AlvisChrs/BlockWorld.git
   cd BlockWorld
   ```

2. **Install dependensi Node.js:**
   ```bash
   npm install
   ```

3. **Jalankan Server:**
   ```bash
   node server.js
   ```

4. **Buka Game di Browser:**
   Buka browser favorit Anda lalu akses alamat:
   ```
   http://localhost:3000
   ```

---

## 🎮 Kontrol Game

| Tombol / Aksi | Fungsi |
|---|---|
| **W / A / S / D** atau **Panah** | Bergerak & Melompat |
| **Klik Kiri Mouse** | Menghancurkan Blok / Menyerang Musuh |
| **Klik Kanan Mouse** | Meletakkan Blok |
| **1 – 5** | Memilih Slot Hotbar |
| **E** | Membuka / Menutup Inventory & Crafting Menu |
| **G** | Membuang (*Drop*) 1 Item dari Slot Aktif |

---

## 🛡️ Commands Admin / Moderator

Ketik perintah berikut di dalam kotak **Global Chat**:

- `/loginadmin admin123` — Mengaktifkan hak akses Admin/Mod.
- `/fly` — Mengaktifkan/mematikan mode terbang.
- `/noclip` — Menembus blok tanpa halangan fisika.
- `/give <id_item> <jumlah>` — Menambahkan item langsung ke tas (Contoh: `/give 4 10`).

---

## 📄 Lisensi

Project ini dikembangkan untuk tujuan pembelajaran dan eksperimen game development berbasis web. Silakan digunakan dan dikembangkan kembali secara bebas.

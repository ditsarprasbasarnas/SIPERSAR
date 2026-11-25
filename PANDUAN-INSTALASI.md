# 📋 PANDUAN INSTALASI — SIPERSAR

Sistem Permintaan Usulan Kebutuhan Sarana dan Prasarana SAR · Direktorat Sarana dan Prasarana Basarnas

Arsitektur: **Google Apps Script (backend REST API + Google Sheets)** dan **GitHub Pages (frontend)**.

| Bagian | Berkas | Ke mana |
|---|---|---|
| Backend | `Kode.gs`, `Data.gs`, `Template.gs`, `TemplateSeed.gs`, `Setup.gs`, `appsscript.json` | Editor Google Apps Script |
| Frontend | `sipersar-frontend.zip` (berisi `index.html`, `css/`, `js/`) | Repository GitHub → GitHub Pages |

---

## BAGIAN A — Backend (Google Apps Script)

### A1. Buat proyek
1. Buka https://script.google.com → **Proyek baru**. Beri nama `SIPERSAR Backend`.
2. Ganti nama `Code.gs` menjadi **`Kode`**, lalu tempel isi `Kode.gs`.
3. Klik **+ → Skrip** untuk membuat berkas berikut lalu tempel isinya masing-masing:
   `Data`, `Template`, `TemplateSeed`, `Setup`.
4. Tampilkan `appsscript.json`: ⚙️ **Setelan proyek** → centang *Tampilkan file manifes "appsscript.json"* → kembali ke Editor → tempel isi `appsscript.json`.
5. Klik 💾 **Simpan**.

> `TemplateSeed.gs` adalah salinan persis sheet **"sarpalsar 2028"** dari `Master_Kebutuhan_sarprasHar_UPT.xlsx` (kolom A–K, nomor baris asli). Jangan diedit manual.

### A2. (Opsional) Tentukan akun Admin awal
⚙️ **Setelan proyek → Properti skrip → Tambahkan properti**:

| Properti | Nilai |
|---|---|
| `ADMIN_USERNAME` | mis. `admin.direktorat` (bila kosong, ini nilai bawaan) |
| `ADMIN_PASSWORD` | kata sandi awal (bila kosong, dibuat acak & ditampilkan di Log) |

`ADMIN_PASSWORD` otomatis **dihapus** dari Script Properties setelah akun dibuat. Admin wajib mengganti kata sandi saat login pertama.

### A3. Daftar 45 Kantor SAR (sudah terisi)
`KANTOR_SEED` di `Setup.gs` sudah berisi 45 Kantor SAR sesuai urutan `Nama_Kantor_SAR.xlsx` (No. 1 Banda Aceh … No. 45 Sorong), disimpan dengan awalan "Kantor SAR ". Di Excel resmi otomatis ditulis "Kantor Pencarian dan Pertolongan <nama>". Kantor baru dapat ditambah Admin lewat menu **Kantor SAR**.

### A4. Jalankan setup — HANYA SEKALI
1. Pilih fungsi **`setupAppEnvironment`** di dropdown → ▶ **Jalankan**.
2. **Tinjau izin** → pilih akun → *Lanjutan* → *Buka SIPERSAR Backend (tidak aman)* → **Izinkan** (akses Drive, Sheets, pemicu).
3. Buka **Log eksekusi**, pastikan muncul:
   - `✅ Template: 344 item dapat diisi, 35 judul, 15 rincian, 26 unit kategori, 123 item satuan otomatis "Pcs".`
   - `⚠️ Baris 42 "Rescue Fast Water": kolom F & I kosong → diberi satuan bawaan "Unit".` (informasi, bukan kesalahan)
   - `✅ 45 Kantor SAR dimuat.`
   - **ADMIN username** dan **ADMIN password** → **catat sekarang**.
4. Di Google Drive akan ada folder **📁 SIPERSAR — Dit. Sarpras Basarnas** berisi **🗃️ Database SIPERSAR** dan folder **Cadangan** (salinan harian otomatis pukul 01.00 WIB, 14 terakhir disimpan).

⚠️ Jangan jalankan `setupAppEnvironment()` dua kali (fungsi akan menolak sendiri bila `SPREADSHEET_ID` sudah ada).

### A5. Deploy sebagai Web App
1. **Terapkan → Deployment baru** → ikon ⚙️ → **Aplikasi web**.
2. *Jalankan sebagai*: **Saya** · *Yang memiliki akses*: **Siapa saja**.
3. **Terapkan** → salin **URL aplikasi web** yang berakhiran **`/exec`**.

> Akses "Siapa saja" diperlukan karena akun SIPERSAR bukan akun Google. Seluruh autentikasi & hak akses diperiksa di server (token sesi di CacheService, peran & Kantor dicek pada setiap permintaan).

**Setiap kali mengubah kode backend**: Terapkan → **Kelola deployment** → ✏️ → Versi: **Versi baru** → Terapkan (URL tetap sama).

### Fungsi bantu di editor
| Fungsi | Kegunaan |
|---|---|
| `resetPasswordAdmin()` | Lupa sandi Admin → buat sandi sementara (lihat Log) |
| `cekKesehatan()` | Ringkasan jumlah baris tiap sheet & periode aktif |
| `rapikanBarisKosong()` | Merapikan baris kosong bekas hapus usulan (otomatis tiap malam) |
| `pasangPemicuCadangan()` | Memasang ulang pemicu cadangan harian |

---

## BAGIAN B — Frontend (GitHub Pages)

### B1. Isi URL backend
Ekstrak `sipersar-frontend.zip`. Buka **`js/config.js`** dengan Notepad, ganti:

```js
GAS_URL: 'https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec',
```
dengan URL `/exec` dari langkah A5. Simpan.

### B2. Push ke GitHub
> **Folder kerja = folder hasil ekstraksi ZIP** (yang di dalamnya langsung terlihat `index.html`, `css`, `js`). Jalankan `git init` di folder ini — jangan di folder induknya, jangan di dalam `js/`.

1. Buat repository **Public** baru di github.com (tanpa centang README/.gitignore/license), mis. `sipersar`.
2. Buka terminal di folder hasil ekstraksi, cek isinya:
   ```bash
   dir        # Windows (atau: ls)  → harus tampil index.html, css, js
   ```
3. Jalankan satu per satu:
   ```bash
   git init
   git add .
   git commit -m "Upload pertama SIPERSAR"
   git branch -M main
   git remote add origin https://github.com/USERNAME/sipersar.git
   git push -u origin main
   ```
   Saat diminta *Password*, tempel **Personal Access Token** (github.com/settings/tokens → *Generate new token (classic)* → centang **repo**). Layar memang tidak menampilkan karakter saat token ditempel — itu normal.
4. Di repository: **Settings → Pages** → Source **Deploy from a branch** → Branch **main** / **(root)** → **Save**. Centang **Enforce HTTPS**.
5. Tunggu 1–2 menit → buka `https://USERNAME.github.io/sipersar/`.

**Memperbarui frontend** (dari folder yang sama):
```bash
git add .
git commit -m "Perbarui SIPERSAR"
git push
```
Bila tampilan belum berubah, tekan **Ctrl+Shift+R**.

---

## BAGIAN C — Langkah pertama di aplikasi
1. Login dengan akun Admin dari Log setup → ganti kata sandi (wajib).
2. **Kantor SAR** → periksa 45 Kantor SAR sudah tampil sesuai urutan resmi.
3. **Template** → klik *Struktur* untuk memeriksa hierarki template resmi.
4. **Periode** → *Buat Periode Baru* (pilih template, isi batas pengisian) → **Buka**.
5. Umumkan alamat GitHub Pages kepada Kantor SAR. Operator mendaftar mandiri di menu *Daftar Mandiri Operator Kantor SAR* dan akunnya langsung aktif.

---

## Arsitektur kecepatan (UX instan)
| Prinsip | Penerapan di SIPERSAR |
|---|---|
| SPA | Sidebar & topbar dibangun sekali; pindah menu hanya mengganti isi halaman. Menu juga mengambil data lebih dulu saat kursor menyorot. |
| Cache lokal | Data halaman disimpan di browser (*stale-while-revalidate*): tampil seketika dari cache lalu diperbarui diam-diam. Bila ada data baru saat Anda sedang mengetik, muncul tombol **"Data terbaru tersedia · Perbarui tampilan"**. |
| Optimistic UI | *Simpan Kategori*, *Simpan & Tandai Selesai Ditinjau*, dan tanda tinjau langsung berlaku di layar; pengiriman ke server berjalan di latar (indikator **"Menyinkronkan…" → "Tersimpan"** di topbar). Isian otomatis disimpan sebagai **draf di perangkat**; bila server menolak, draf dapat dipulihkan. |
| CacheService | Server membaca sheet dari cache bertoken versi; cache otomatis tidak dipakai lagi setiap ada penulisan. |
| Batch | Login langsung membawa data dashboard; data menu lain diambil dalam satu permintaan gabungan. |

Catatan: *Kirim Pendataan*, *Identitas Kepala*, *Salin Periode*, dan *Unduh Excel* menunggu antrean sinkron selesai dulu agar urutan data selalu benar. Jangan menutup tab saat indikator "Menyinkronkan…" masih tampil (browser akan memperingatkan).

**Pembaruan dari versi sebelumnya:** ganti `Kode.gs`, `Data.gs`, `Setup.gs` lalu **Terapkan → Kelola deployment → Versi baru** (tidak perlu menjalankan setup ulang), dan push ulang isi ZIP frontend.

## Catatan pembacaan Excel master (sudah diterapkan)
- **2 kelompok, 7 bagian, 25 kategori berhuruf, 403 baris nomenklatur, 344 item dapat diisi** (baris 6–408). Nama, ejaan, penomoran (`a.`, `- `, `1).`), dan satuan disalin **apa adanya** — termasuk ejaan asli seperti *Ekstrikasi*, *binocullar*, *Clucth*, *Shark Reppelant*, *Over Pressure Valce* — tidak ada yang dikoreksi.
- Penomoran kategori dipertahankan seperti master: **Peralatan Pertolongan A, B, C, D, F, G** dan **Perlengkapan A, B, C, D, F** (tanpa huruf E).
- **III Peralatan Pendukung** tidak memiliki kategori berhuruf (langsung nomor 1–21). Bagian ini dijadikan **satu unit kategori untuk ditinjau**, sehingga total yang wajib ditandai *Selesai Ditinjau* adalah **26** (25 kategori + 1 bagian).
- **ITEM dengan RINCIAN**: baris bersatuan yang turunannya berupa daftar "- …" tanpa satuan diperlakukan sebagai satu item paket; turunannya tampil sebagai keterangan isi paket (15 baris), contoh *Heavy Rescue Hydraulic Set (set)* → *Rescue Spreader…, Rescue Ram, Chain set*.
- **Sarana Udara diusulkan terpisah**: *Fixed Wing Rescue* dan *Rotary Wing Rescue* menjadi JUDUL; *Medium Range (MRG)*, *Light Helicopter*, dan *Medium Helicopter* masing-masing dapat diisi dengan satuan **unit** dari baris induknya.
- **Satuan otomatis "Pcs"**: 123 item di IV.D dan IV.F (baris 277–408).
- **Rescue Fast Water** (baris 42) tidak memiliki satuan di master → diberi satuan **"Unit"**.
- **Kode item** dibuat stabil dari hierarki nama (bukan nomor baris) agar data cocok saat disalin antarperiode.

## Batasan Google Apps Script
- Data `Riwayat_Perubahan` terus bertambah; arsipkan per periode bila spreadsheet mendekati batas 10 juta sel.
- Sesi login berakhir setelah 2 jam tanpa aktivitas.
- Login dikunci 5 menit setelah 5 kali gagal.

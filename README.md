# Super App Koperasi Merah Putih — REST API

Backend REST API siap-jalan (Node.js + Express) untuk Super App Koperasi Desa/Kelurahan Merah Putih.
Mencakup 4 pilar fitur: **Simpan Pinjam & Keuangan Digital**, **Mart/POS & Inventori**, **Administrasi & Manajemen Anggota**, dan **Layanan Interaktif Anggota** (pengaduan, e-learning, program pemerintah).

Database menggunakan **file JSON lokal** (lowdb) — tidak perlu install MySQL/PostgreSQL, jadi bisa langsung `npm install` dan jalan di server mana pun yang punya Node.js. (Untuk skala produksi/multi-server, lihat catatan "Migrasi ke Database Nyata" di bawah.)

---

## 1. Menjalankan di Server

### Prasyarat
- Node.js v18 atau lebih baru
- npm

### Langkah instalasi

```bash
# 1. Ekstrak/upload folder ini ke server
cd koperasi-merah-putih-api

# 2. Install dependency
npm install

# 3. Salin file environment
cp .env.example .env
# lalu edit .env — WAJIB ganti JWT_SECRET dan DEFAULT_ADMIN_PASSWORD sebelum production!

# 4. Jalankan server
npm start
```

Server berjalan di `http://localhost:4000` (atau sesuai `PORT` di `.env`).
Cek status: `GET http://localhost:4000/api/health`

Saat pertama kali dijalankan, sistem otomatis membuat:
- Akun **pengurus** default (email & password sesuai `.env`, lihat log konsol saat start)
- Contoh produk Mart, 1 kelas e-learning, dan 1 program pemerintah (data contoh, silakan dihapus/ubah)

### Menjalankan sebagai service permanen (disarankan untuk production)

Gunakan [PM2](https://pm2.keymetrics.io/) agar API tetap berjalan setelah server restart:

```bash
npm install -g pm2
pm2 start src/index.js --name koperasi-merah-putih-api
pm2 save
pm2 startup
```

Untuk expose ke internet dengan domain, gunakan reverse proxy **Nginx** ke port aplikasi (`PORT` di `.env`), lalu pasang SSL dengan Certbot/Let's Encrypt.

### Backup data

Seluruh data tersimpan di satu file: `data/db.json`. Backup rutin file ini (mis. cron job harian menyalin ke folder backup atau cloud storage).

---

## 2. Struktur Proyek

```
src/
  index.js                 # entry point server + seeding data awal
  db.js                    # skema & inisialisasi database (lowdb JSON)
  middleware/auth.js        # JWT auth & role guard
  utils/helpers.js          # helper (ID generator, response format, pagination)
  routes/
    auth.routes.js          # register, login, profil
    members.routes.js       # data anggota, verifikasi, kartu anggota digital
    savings.routes.js       # simpanan pokok/wajib/sukarela, SHU
    loans.routes.js         # pengajuan & persetujuan pinjaman, cicilan
    wallet.routes.js        # dompet digital, transfer, bayar tagihan, QRIS
    pos.routes.js           # kasir/POS Mart & Apotek
    inventory.routes.js     # stok masuk/keluar, low-stock alert
    marketplace.routes.js   # marketplace produk UMKM desa
    admin.routes.js         # dashboard & laporan keuangan pengurus
    microsite.routes.js     # profil publik koperasi
    complaints.routes.js    # pengaduan/whistleblowing
    elearning.routes.js     # kelas literasi & kuis edukasi
    government.routes.js    # program bantuan pemerintah
data/db.json                # database (dibuat otomatis)
```

## 3. Peran Pengguna (Role)

| Role       | Deskripsi                                                          |
|------------|----------------------------------------------------------------------|
| `anggota`  | Warga/UMKM terdaftar sebagai anggota koperasi                        |
| `kasir`    | Staf kasir Mart/Apotek — akses POS & inventori                       |
| `pengurus` | Admin koperasi — akses penuh: verifikasi anggota, approval pinjaman, laporan keuangan, dsb. |

Buat akun `kasir` baru melalui `POST /api/admin/staff` (login sebagai `pengurus`).

## 4. Alur Autentikasi

1. `POST /api/auth/register` — anggota daftar mandiri (onboarding + upload data KTP)
2. `POST /api/auth/login` — dapat token JWT
3. Sertakan header `Authorization: Bearer <token>` di setiap request yang butuh login
4. Pengurus memverifikasi anggota via `POST /api/members/:id/verify` → kartu anggota digital diterbitkan otomatis

## 5. Ringkasan Endpoint

### Autentikasi & Anggota
- `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET /api/members` (pengurus) · `GET/PATCH /api/members/:id`
- `POST /api/members/:id/verify` (pengurus)
- `GET /api/members/:id/kartu-anggota`

### Simpan Pinjam
- `POST /api/savings/deposit` — setor simpanan pokok/wajib/sukarela
- `GET /api/savings/balance/:memberId` · `GET /api/savings/history/:memberId`
- `POST /api/savings/shu` (pengurus) · `GET /api/savings/shu/:memberId`
- `POST /api/loans/apply` · `GET /api/loans` · `GET /api/loans/:id`
- `POST /api/loans/:id/decision` (pengurus — approve/reject cepat)
- `POST /api/loans/:id/pay` — bayar cicilan dari dompet digital

### Dompet Digital & Pembayaran
- `GET /api/wallet/:memberId/balance` · `GET /api/wallet/:memberId/history`
- `POST /api/wallet/topup` · `POST /api/wallet/transfer`
- `POST /api/wallet/pay-bill` (PLN/PDAM/Pulsa/Internet)
- `POST /api/wallet/qris-pay`

### Mart / POS & Inventori
- `GET/POST/PATCH /api/pos/products` · `POST /api/pos/checkout` · `GET /api/pos/transactions`
- `POST /api/inventory/movement` · `GET /api/inventory/movements`
- `GET /api/inventory/low-stock` · `GET /api/inventory/summary`

### Marketplace Desa
- `GET/POST/PATCH /api/marketplace/products` · `GET /api/marketplace/my-products`
- `POST /api/marketplace/orders` · `GET /api/marketplace/orders` · `PATCH /api/marketplace/orders/:id/status`

### Administrasi & Dashboard Pengurus
- `GET /api/admin/dashboard`
- `GET /api/admin/reports/neraca` · `/laba-rugi` · `/arus-kas`
- `POST /api/admin/staff` — buat akun kasir/pengurus baru

### Microsite Profil Koperasi
- `GET /api/microsite/profile` (publik) · `PUT /api/microsite/profile` (pengurus)

### Layanan Interaktif
- `POST /api/complaints` · `GET /api/complaints/mine` · `GET /api/complaints` (pengurus) · `POST /api/complaints/:id/respond`
- `GET/POST /api/elearning/courses` · `POST /api/elearning/courses/:id/enroll` · `/progress` · `/quiz`
- `GET/POST /api/government/programs` · `POST /api/government/programs/:id/apply` · `GET/PATCH /api/government/applications`

Semua response mengikuti format:
```json
{ "success": true, "message": "...", "data": { ... } }
```

## 6. Contoh Request (cURL)

```bash
# Daftar anggota baru
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nama":"Siti Aminah","email":"siti@example.com","password":"rahasia123","noKTP":"3201xxxxxxxxxxxx","noHp":"08123456789","alamat":"Desa Sukamaju"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"siti@example.com","password":"rahasia123"}'

# Setor simpanan wajib (pakai token dari login)
curl -X POST http://localhost:4000/api/savings/deposit \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{"jenis":"wajib","jumlah":50000}'
```

## 7. Migrasi ke Database Nyata (opsional, untuk skala besar)

Struktur kode ini sengaja dipisah per modul (`src/routes/*.js`) yang semuanya mengakses data lewat objek `db.data`. Jika ke depan traffic sudah besar dan butuh PostgreSQL/MySQL:
1. Ganti isi `src/db.js` dengan koneksi ORM (mis. Prisma/Sequelize) yang mengekspos struktur data serupa.
2. Route lain **tidak perlu diubah banyak** selama nama koleksi/tabel tetap konsisten.

## 8. Keamanan Sebelum Produksi

- Ganti `JWT_SECRET` dan `DEFAULT_ADMIN_PASSWORD` di `.env`.
- Aktifkan HTTPS (lewat reverse proxy Nginx + SSL).
- Tambahkan rate-limiting (mis. `express-rate-limit`) pada endpoint login/register jika akan publik.
- Untuk upload foto KTP/produk yang sesungguhnya, arahkan ke storage terpisah (S3/cloud storage) — saat ini field `fotoKTP`/`foto` menerima URL/base64 string sebagai placeholder.

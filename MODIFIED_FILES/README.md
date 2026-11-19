# Still Good — Next.js + Express + Prisma + PostgreSQL

Repository ini merupakan versi migrasi stack Still Good dari Laravel/PHP ke stack yang tercantum pada dokumen teknik:

- **Presentation Layer:** Next.js + React (HTML, CSS, JavaScript/TypeScript)
- **Business Layer:** Node.js + Express.js
- **Data Access Layer:** Prisma ORM 7
- **Database Layer:** PostgreSQL
- **Authentication:** JWT HS256 + bcrypt
- **Location Service:** Browser Geolocation, perhitungan radius Haversine, dan Google Maps Geocoding API opsional
- **Payment Service:** Midtrans Snap Sandbox/Production (opsional melalui environment); mode `mock` untuk demo lokal tanpa transaksi uang sungguhan
- **Deployment:** Docker Compose untuk PostgreSQL; frontend dan API dapat dijalankan sebagai service terpisah

## 1. Tampilan UI

Markup, stylesheet utama, class CSS, ukuran komponen, warna, aset gambar, struktur halaman, serta modal diambil dari aplikasi lama dan dipertahankan. Frontend Next.js menyajikan markup lama sebagai fragment React agar tampilan tidak perlu didesain ulang. File utama:

- `apps/web/app/marketplace-markup.ts`
- `apps/web/app/globals.css` (salinan stylesheet lama)
- `apps/web/public/assets/app.js` (interaksi lama, dengan penyesuaian API, admin login, dan redirect pembayaran)
- `apps/web/public/assets/*` (aset gambar lama)

Tampilan halaman hasil pembayaran Midtrans merupakan halaman tambahan dan memakai warna serta komponen visual yang sama.

## 2. Prasyarat

- Node.js **22.12 atau lebih baru**
- npm 10 atau lebih baru
- Docker Desktop (direkomendasikan untuk menjalankan PostgreSQL)

## 3. Instalasi lokal

Jalankan dari root folder repository:

```bash
# 1. Salin konfigurasi API
cp apps/api/.env.example apps/api/.env
```

Pada Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Pastikan `DATABASE_URL` mengarah ke PostgreSQL lokal. Nilai default di `.env.example` cocok dengan `docker-compose.yml`.

```bash
# 2. Jalankan PostgreSQL
docker compose up -d db

# 3. Install semua dependency workspace
 npm install

# 4. Generate Prisma Client
 npm run db:generate

# 5. Buat tabel berdasarkan Prisma schema
 npm run db:migrate

# 6. Isi kategori awal dan akun admin opsional
 npm run db:seed

# 7. Jalankan Express dan Next.js bersamaan
 npm run dev
```

Buka:

- Frontend: http://localhost:3000
- API health: http://localhost:4000/health


Untuk menjalankan seluruh service menggunakan Docker setelah menyiapkan `apps/api/.env`, gunakan:

```bash
docker compose up --build
```

API container akan menjalankan migration yang disertakan dan seed saat start.

## 4. Akun admin

Isi `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` di `apps/api/.env`, lalu jalankan ulang:

```bash
npm run db:seed
```

Login admin menggunakan tab **Admin** pada modal login. Jangan gunakan password contoh untuk deployment.

## 5. Mode pembayaran

### Demo lokal

Konfigurasi default:

```env
PAYMENT_MODE=mock
```

Mode ini menandai pembayaran sebagai simulasi agar alur marketplace dan status pesanan dapat diuji tanpa memindahkan uang. Status refund di mode ini hanya catatan simulasi dan **bukan pengembalian dana nyata**.

### Midtrans Sandbox

1. Buat akun merchant Midtrans dan ambil Server Key dari dashboard Sandbox.
2. Atur pada `apps/api/.env`:

```env
PAYMENT_MODE=midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_IS_PRODUCTION=false
WEB_PUBLIC_URL=http://localhost:3000
```

3. Atur URL notifikasi transaksi pada dashboard Midtrans menjadi:

`https://<alamat-api-yang-dapat-diakses-publik>/api/payments/midtrans/notification`

4. Untuk pengujian lokal, endpoint API perlu diekspos melalui HTTPS/tunnel agar server Midtrans dapat mengirim webhook.

Implementasi membuat Snap transaction, mengarahkan pembeli ke halaman pembayaran Midtrans, memverifikasi signature notifikasi, memulai timer pembatalan satu menit dan deadline respons penjual lima menit setelah pembayaran dinyatakan berhasil, serta mengirim permintaan refund melalui endpoint Midtrans.

**Catatan:** refund Midtrans harus diaktifkan untuk akun dan metode pembayaran terkait. Keberhasilan request refund mengikuti respons provider, bukan sekadar perubahan status pada database.

## 6. Google Maps

Browser Geolocation digunakan untuk membaca lokasi pembeli. Backend menghitung jarak dengan rumus Haversine dan menerapkan radius pencarian default 5 km ketika koordinat pembeli tersedia.

Untuk mengubah alamat toko menjadi koordinat secara otomatis, atur:

```env
GOOGLE_MAPS_API_KEY=your-google-maps-geocoding-api-key
```

Tanpa API key, aplikasi tetap dapat digunakan untuk pencarian katalog biasa, tetapi koordinat toko tidak akan terisi otomatis sehingga pemfilteran radius berdasarkan GPS belum aktif. Pastikan Geocoding API diaktifkan dan API key dibatasi sesuai praktik keamanan Google Cloud.

## 7. Data dan tabel

Prisma schema membuat tabel:

- `users`
- `stores`
- `categories`
- `products`
- `orders`
- `order_items`
- `payments`
- `reviews`
- `notifications`

`order_items` menyimpan snapshot nama, gambar, dan harga produk untuk menjaga histori transaksi ketika produk tidak aktif lagi. Penghapusan listing dilakukan dengan menonaktifkan produk, bukan menghapus histori pesanan.

## 8. Endpoint API utama

Semua endpoint berada di `/api`. Endpoint yang memerlukan autentikasi menggunakan header `Authorization: Bearer <JWT>`.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/config` | Mode pembayaran dan provider lokasi aktif |
| GET | `/api/me` | Profil akun aktif |
| POST | `/api/register` | Registrasi pembeli/penjual |
| POST | `/api/login` | Login pembeli/penjual/admin |
| POST | `/api/logout` | Logout sisi aplikasi (token dihapus browser) |
| POST | `/api/profile` | Update profil dan data toko |
| GET | `/api/categories` | Kategori publik |
| GET | `/api/stores` | Direktori toko dan radius lokasi |
| GET | `/api/products` | Katalog produk |
| GET/POST | `/api/seller/products` | Daftar/tambah listing penjual |
| POST/PATCH | `/api/seller/products/:id` | Edit listing |
| DELETE | `/api/seller/products/:id` | Nonaktifkan listing |
| POST | `/api/orders` | Checkout dan reservasi stok |
| GET | `/api/orders` | Riwayat pesanan |
| GET | `/api/orders/:id` | Detail pesanan |
| POST | `/api/orders/:id/cancel` | Pembatalan oleh pembeli |
| POST | `/api/orders/:id/status` | Perubahan status/validasi pickup oleh penjual |
| GET | `/api/seller/orders` | Pesanan masuk penjual |
| POST | `/api/reviews` | Rating dan ulasan |
| GET | `/api/notifications` | Riwayat notifikasi in-app |
| GET | `/api/payments/status/:orderId` | Status pembayaran untuk halaman return |
| GET/POST/PATCH/DELETE | `/api/admin/categories` | Kelola kategori admin |
| POST | `/api/payments/midtrans/notification` | Webhook Midtrans |

## 9. Aturan bisnis yang diproses backend

- Checkout hanya dapat berisi produk dari satu toko.
- Stok dikurangi dalam transaksi database menggunakan conditional update `stock >= quantity` untuk menghindari overselling.
- Produk dengan stok nol, listing nonaktif, atau `safe_until` yang sudah lewat tidak ditampilkan dan tidak dapat di-checkout.
- Pembeli hanya dapat membatalkan pesanan selama 60 detik setelah pembayaran berhasil.
- Jika penjual tidak merespons dalam lima menit, scheduler memproses pembatalan dan refund (atau catatan refund pada mode mock).
- Status pesanan bergerak melalui `Menunggu Konfirmasi` → `Diproses` → `Siap Diambil` → `Selesai`.
- Status `Selesai` membutuhkan PIN pickup yang cocok.
- Satu pesanan hanya dapat diberi satu ulasan setelah selesai.

## 10. Batasan yang masih perlu konfigurasi/pengujian

- Midtrans membutuhkan Server Key dan webhook publik; tidak ada kredensial rahasia yang disertakan dalam repository.
- Google Maps Geocoding membutuhkan API key; pencarian radius tetap berjalan berdasarkan koordinat manual/browser.
- GoSend pada UI masih merupakan pilihan metode delivery eksternal, bukan integrasi API GoSend.
- Notifikasi saat ini dicatat sebagai in-app notification di database; push notification perangkat belum dikonfigurasi.
- Estimasi dampak pada tampilan saat ini menggunakan asumsi awal 0,3 kg per porsi untuk ilustrasi. Nilai ini belum merupakan hasil pengukuran atau perhitungan LCA yang tervalidasi dan perlu diganti dengan sumber/metodologi yang disepakati tim.
- Pengujian black-box, concurrency, callback provider, dan responsive browser tetap harus dilakukan sebelum sistem dinyatakan siap produksi.

## 11. Perintah build dan cek

```bash
npm run build
npm --workspace apps/api run check
```

Generated Prisma Client dibuat saat menjalankan `npm run db:generate`; folder hasil generate tidak disimpan di ZIP.


## Aturan akun dan pembayaran (revisi UI RPL)

- Registrasi publik hanya membuat akun **Pembeli**. Endpoint `POST /api/register` menetapkan `role=buyer` di server dan menolak payload `seller`/`admin`.
- Akun **Penjual** dibuat oleh operator dari root repository dengan `npm run db:create-seller`. Script meminta nama, email, nomor HP, nama toko, alamat, dan password, lalu membuat user role `seller` beserta data tokonya.
- Akun **Admin** dibuat oleh operator melalui `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, dan `SEED_ADMIN_PASSWORD` pada `apps/api/.env`, kemudian jalankan `npm run db:seed`. Jangan pernah menyediakan registrasi admin publik.
- Login tetap memiliki tab Pembeli, Penjual, dan Admin. Tautan Daftar hanya terlihat saat tab Pembeli dipilih.
- Checkout hanya menyediakan **QRIS**. API `POST /api/orders` menolak payment method selain `QRIS`, dan Midtrans Snap dibatasi ke channel `other_qris`.
- `PAYMENT_MODE=mock` tetap merupakan simulasi lokal tanpa uang sungguhan. Untuk mencoba QRIS Sandbox, set `PAYMENT_MODE=midtrans` dan isi `MIDTRANS_SERVER_KEY` dengan Server Key Sandbox milik akun Midtrans. Webhook perlu diarahkan ke endpoint `/api/payments/midtrans/notification` melalui URL yang dapat diakses Midtrans.

### Membuat akun penjual secara manual

Jalankan di root repository setelah database aktif dan Prisma Client sudah digenerate:

```powershell
npm run db:create-seller
```

Ikuti prompt pada terminal. Script ini tidak membuat akun penjual dari website; hanya operator yang dapat menjalankannya dari lingkungan pengembangan/deployment.

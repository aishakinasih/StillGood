# Catatan revisi Still Good — UI RPL, akses akun, dan QRIS

## Ringkasan perubahan

1. Registrasi dari website hanya membuat akun Pembeli. Server menetapkan `role: buyer`; kiriman `seller` atau `admin` ditolak.
2. Login tetap memiliki tiga tab: Pembeli, Penjual, dan Admin. Tautan Daftar hanya terlihat ketika tab Pembeli dipilih. Pada tab Penjual/Admin, UI menampilkan keterangan bahwa akun harus dibuat pengelola.
3. Form registrasi mengikuti urutan referensi Frame 33: Nama, Email, Kata sandi, Konfirmasi kata sandi, No. HP, Register. Logo Still Good menggunakan aset Figma yang sudah ada.
4. Checkout hanya menampilkan QRIS. API Express hanya menerima `payment_method: QRIS`. Midtrans Snap juga dibatasi pada channel `other_qris`.
5. Tambah command operator `npm run db:create-seller` untuk membuat akun Penjual plus Store secara manual melalui terminal/Prisma. Tidak ada endpoint registrasi penjual publik.
6. Perbaiki CSS yang berpotensi memicu parsing error dan memperluas perbaikan header desktop agar tidak hanya berlaku sampai lebar 1500 px.

## Daftar file yang dimodifikasi

- `apps/web/app/marketplace-markup.ts` — tampilan checkout QRIS-only.
- `apps/web/app/globals.css` — gaya autentikasi mengikuti warna/UI RPL, kartu QRIS, pembersihan artefak CSS, layout desktop.
- `apps/web/public/assets/app.js` — form registrasi pembeli saja, tab role login, link daftar dinamis, pilihan QRIS tetap.
- `apps/api/src/routes/api.js` — hardening endpoint registrasi pembeli saja dan validasi QRIS.
- `apps/api/src/services/payment.service.js` — Midtrans Snap hanya mengaktifkan channel QRIS.
- `apps/api/prisma/create-seller.js` — utilitas operator untuk membuat akun penjual dan toko.
- `apps/api/package.json`, `package.json` — command `db:create-seller`.
- `.env.example`, `apps/api/.env.example` — catatan konfigurasi QRIS.
- `README.md` — instruksi menjalankan aturan akun dan pembayaran.

Folder `MODIFIED_FILES/` berisi salinan penuh dari setiap file yang berubah, dengan susunan subfolder yang sama, agar mudah diperiksa atau disalin satu per satu. Source utama proyek di folder ini juga sudah berisi perubahan tersebut.

## Cara memasang

1. Backup folder proyek saat ini.
2. Ekstrak ZIP revisi ini.
3. Gunakan folder `Still-Good_Bon-Cabe-lvl-15-main` dari ZIP sebagai proyek baru, atau salin file dari folder `MODIFIED_FILES` ke path yang sama pada repository yang sedang dipakai.
4. Jangan menyalin file `.env.example` di atas `.env` yang sudah berisi konfigurasi lokal. Pertahankan `apps/api/.env` milikmu dan pastikan `DATABASE_URL`, `JWT_SECRET`, serta `PAYMENT_MODE` benar.
5. Karena schema database tidak berubah, tidak perlu menghapus volume PostgreSQL atau mengulang migration. Jalankan kembali `npm run dev`.
6. Untuk membuat akun Penjual: `npm run db:create-seller`. Untuk membuat akun Admin lewat seed: isi `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` di `apps/api/.env`, lalu jalankan `npm run db:seed`.

## Validasi yang dilakukan pada source

- `node --check` berhasil untuk `app.js`, `api.js`, `payment.service.js`, dan `create-seller.js`.
- `globals.css` lolos parsing CSS menggunakan tinycss2 (tanpa parse error).
- Source string `marketplace-markup.ts` dapat diparse sebagai JavaScript string, dan UI checkout tidak lagi memuat pilihan non-QRIS.
- Full build Next.js dan tes integrasi PostgreSQL/Midtrans belum dijalankan di lingkungan pembuatan ZIP ini. Jalankan `npm run build` dan pengujian lokal setelah mengganti file.

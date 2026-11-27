# PEMBAYARAN-SYAHRIAH

Administrasi keuangan syahriyah pesantren berbasis React (Vite), Express, dan PostgreSQL di Neon. Aplikasi mencakup login admin, data santri, tagihan bulanan, pembayaran, ringkasan dashboard, laporan, dan pengaturan akun.

## Persyaratan

- Node.js 20 atau lebih baru dan npm
- Database PostgreSQL di Neon

## Menyiapkan proyek di VS Code

1. Buka folder proyek ini di VS Code.
2. Jalankan `npm install` pada terminal proyek.
3. Salin `.env.example` menjadi `.env`. Ganti `DATABASE_URL` dengan connection string PostgreSQL dari halaman Neon (sertakan `sslmode=require`), lalu isi kredensial admin awal. Jangan commit atau membagikan connection string karena berisi password database. Buat nilai rahasia JWT baru dengan PowerShell:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
   ```

   File `.env.local` lama dari starter Next.js hanya berisi konfigurasi Firebase dan **tidak menggantikan `.env` SANTRI-CATAT**. Server backend memerlukan `JWT_SECRET` dan `DATABASE_URL` Neon pada `.env`.

4. Pastikan proyek Neon sudah dibuat dan URL database dapat diakses. Saat backend pertama kali berjalan, tabel aplikasi dibuat dari `server/schema.sql` pada database yang dipilih oleh `DATABASE_URL`. Data yang sudah ada di MySQL tidak disalin otomatis; ekspor dan impor data lama perlu dilakukan terpisah.
5. Jalankan `npm run dev`. Buka alamat Vite yang ditampilkan (biasanya http://localhost:5173).

Backend API tersedia di port `4000`; Vite meneruskan permintaan `/api` ke backend. Pada startup pertama, akun admin dibuat dari `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` bila belum ada. Password disimpan sebagai bcrypt hash. Tidak ada pendaftaran publik. Kredensial admin pertama tidak di-hardcode ke source code.

Untuk produksi, atur `NODE_ENV=production`, `JWT_SECRET` kuat, HTTPS, dan `DATABASE_URL` Neon; jalankan `npm run build`, kemudian `npm start`. Express menyajikan hasil build Vite pada mode produksi.

## Variabel konfigurasi

Lihat `.env.example` untuk daftar lengkap variabel. `DATABASE_URL` berisi connection string PostgreSQL Neon. Variabel `*_MONTHLY_FEE` mengatur setiap komponen biaya bulanan: Syahriyah, Diniyah, listrik/air bersih, kebersihan/perlengkapan, Haflah Syahriyah, Maklumat, Modul LKS, kegiatan kesiswaan, dan Haflah Madrasah. Total default adalah Rp500.000 per bulan. `JWT_SECRET` wajib diisi dengan minimal 32 karakter. Kredensial admin awal hanya digunakan untuk membuat akun pertama dan tidak menimpa akun yang sudah ada.

## Fitur aplikasi

- Akses halaman admin diproteksi token JWT di cookie `HttpOnly`, `SameSite=Strict`, dengan masa berlaku delapan jam.
- Pencarian, filter status, pagination, serta tambah/edit/hapus santri.
- Santri aktif yang baru ditambahkan otomatis mendapat 12 tagihan bulanan masing-masing Rp500.000 mulai bulan tanggal masuk, berisi semua komponen biaya. Santri tidak aktif tidak mendapat tagihan otomatis. Setiap tagihan menampilkan tanggal pembayaran terakhir dan berstatus Lunas setelah seluruh nominal bulan itu dibayar.
- Pembuatan tagihan untuk semua santri aktif atau santri terpilih; periode ganda ditolak oleh unique key database.
- Pembayaran parsial/penuh dicatat dalam transaksi database, mengunci tagihan saat validasi sisa, dan menghitung status otomatis. Status tagihan tampil pada riwayat pembayaran dan bukti transaksi.
- Bukti pembayaran dapat dicetak dari browser.
- Dashboard dan laporan membaca data database. Laporan dapat difilter, diekspor sebagai Excel, atau dicetak/disimpan ke PDF dari dialog cetak browser.
- Penghapusan santri menghapus permanen seluruh tagihan dan riwayat pembayarannya dalam satu transaksi.

Skema database: [server/schema.sql](./server/schema.sql). API Express: [server/index.js](./server/index.js). Aplikasi React: [client/src/App.jsx](./client/src/App.jsx).
"# praktikum-react-pondok" 
"# praktikum-react-pondok" 

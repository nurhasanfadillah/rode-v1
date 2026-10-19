# RODE — Redone Output Data Entry
Sistem manajemen produksi real-time untuk PT REDONE BERKAH MANDIRI. Sistem ini mencatat hasil Printing, Sewing (per line dan per blok waktu), dan Packing, lalu menampilkan hasilnya di dashboard manajer dan di layar Smart TV.

## Untuk siapa
- **Operator**: mencatat hasil produksi dari ponsel di lantai produksi. Akses hanya ke departemen dan line yang ditugaskan.
- **Manajer**: memantau hasil semua departemen, membandingkan dengan target, dan melihat line yang tertinggal.
- **Super Admin**: mengatur pengguna, master data, shift, blok, target, aturan koreksi, dan link Smart TV.
- **Layar Smart TV**: papan produksi baca-saja di area pabrik.

## Fitur inti dan pengalaman
**Login dan hak akses**
- Login pakai username dan password. Akun hanya bisa dibuat oleh Super Admin, tidak ada pendaftaran terbuka.
- Session aman dengan masa berlaku dan logout. Akun dikunci sementara setelah beberapa kali gagal login.
- Pembatasan role dicek di server. Operator yang mengubah URL atau request tetap ditolak.

**Master data (Super Admin)**
- Departemen (Printing, Sewing, Packing; bisa ditambah atau dinonaktifkan).
- Produk: kode unik, nama, kategori, satuan (default PCS), target default, catatan, status aktif.
- Line Sewing: jumlahnya tidak dibatasi. Tiap line punya kode, nama, urutan tampil, target harian, **target per blok**, dan operator yang ditugaskan.
- Pengguna: nama, username, role, departemen, line, status aktif.
- Semua daftar punya pencarian, filter, dan pagination.

**Input Sewing (modul inti)**
- Operator memilih produk, lalu menekan tombol besar "+1 PCS". Tombol bisa ditekan dengan satu tangan.
- Input jumlah (beberapa pcs sekaligus) hanya muncul jika diaktifkan admin. Input ini disimpan sebagai satu transaksi dengan kuantitasnya, bukan dipecah menjadi pcs palsu.
- Waktu diambil dari server dengan zona Asia/Jakarta. Tanggal kerja, shift, line, dan nomor blok ditentukan otomatis. Batas blok dihitung setengah terbuka, jadi input tepat pukul 08.45 masuk Blok 2.
- Setiap input diberi kunci anti-duplikat. Double tap atau retry jaringan tidak menggandakan jumlah.
- **Grid blok berwarna** menampilkan status tiap blok dibanding target per blok:
  - Abu-abu: blok belum dibuka (belum mulai).
  - Merah: blok sudah berjalan atau lewat, tetapi masih kosong.
  - Kuning: sudah ada isi, tetapi target belum terpenuhi.
  - Hijau: target terpenuhi.
  - Blok istirahat diberi tanda tersendiri dan tidak dihitung merah.
  - Selain warna, setiap status juga diberi ikon dan label, jadi tidak hanya mengandalkan warna.
- Ringkasan hari ini: total per produk, per blok, dan total line.

**Input Printing dan Packing**
- Pilih tanggal kerja (default hari ini), cari produk, isi kuantitas dan catatan opsional, lalu simpan.
- Total harian per produk diperbarui langsung.

**Riwayat dan koreksi**
- Riwayat transaksi bisa difilter berdasarkan tanggal, departemen, line, produk, operator, dan status, dengan pagination.
- Koreksi kuantitas atau pembatalan wajib disertai alasan. Nilai lama, nilai baru, pelaku, dan waktu koreksi disimpan. Data tidak pernah dihapus diam-diam.
- Transaksi yang dibatalkan tidak dihitung di mana pun.
- Admin menentukan siapa yang boleh mengoreksi: operator (input sendiri, dalam batas waktu tertentu), manajer, dan admin.
- Audit log mencatat login, koreksi, pembatalan, dan perubahan konfigurasi.

**Dashboard manajer**
- KPI: Printing, Sewing, dan Packing hari ini, target, persentase capaian, jumlah line aktif, produk tertinggi, dan waktu update terakhir dari server.
- Total antar-departemen tidak dijumlahkan sebagai "produksi unik". Tiap tahap ditampilkan terpisah, disertai penjelasan definisi metrik.
- Grafik: hasil per blok/jam, per departemen, target vs aktual, perbandingan line, dan tren harian.
- Tabel hasil per produk, peringkat line tertinggi dan terendah, serta indikator line tanpa input saat jam kerja aktif (tidak berlaku saat istirahat atau di luar jadwal).
- Filter global (tanggal/rentang, departemen, line, shift, produk, operator) berlaku untuk semua KPI, grafik, dan tabel.
- Pembaruan otomatis dengan polling terkontrol. Polling melambat atau berhenti saat tab tidak aktif.

**Live Production Board — Smart TV (`/display/production`)**
- Full-screen dengan kontras tinggi dan angka besar. Layout tidak bergeser saat angka berubah. Tidak ada sidebar, tombol input, atau data pribadi.
- Header berisi logo, tanggal dan jam WIB, status operasional, dan indikator koneksi.
- Baris KPI: Printing, Sewing, Packing, dan capaian target.
- Kartu tiap line Sewing: hasil blok terakhir, total hari ini, target, persentase, produk yang sedang dikerjakan, status aktivitas, dan **grid blok berwarna yang sama**.
- Mode tampilan: semua departemen, Sewing saja, Printing dan Packing, satu line tertentu, atau rotasi panel.
- Akses lewat link bertoken rahasia yang bisa dibuat dan dicabut admin. Saat koneksi putus, layar tersambung ulang otomatis.

**Pengaturan admin**
- Shift (jam mulai dan akhir), durasi blok, istirahat (dikecualikan dari blok atau mengikuti jadwal khusus), hari kerja, dan aturan input di luar jam kerja.
- Target harian dan target per blok, interval refresh dashboard, pengaturan Smart TV, dan aturan koreksi.
- Konfigurasi jadwal berlaku mulai tanggal tertentu dan tersimpan sebagai versi. Transaksi lama tetap memakai aturan yang berlaku saat itu.

**PWA dan mobile**
- Bisa di-install di ponsel (manifest, ikon, install prompt).
- Saat offline, aplikasi menampilkan status jelas dan tidak pernah mengklaim data sudah tersimpan.

## Alur pengguna
1. **Operator Sewing**: login → line dan departemen termuat otomatis → pilih produk → tekan "+1 PCS" → muncul konfirmasi dari server → grid blok dan total diperbarui.
2. **Operator Printing/Packing**: login → pilih tanggal dan produk → isi jumlah → simpan → total harian diperbarui.
3. **Manajer**: login → dashboard hari ini → atur filter → klik KPI atau grafik untuk melihat transaksi asal angka → koreksi jika diizinkan.
4. **Super Admin**: login → kelola pengguna, master data, shift, dan target → buat link Smart TV → tinjau audit log.
5. **Smart TV**: buka link bertoken → papan diperbarui otomatis sepanjang hari.

## Nuansa UI/UX
- Gaya korporat enterprise yang bersih, dengan warna utama Navy `#0A2463` dan Teal `#3CAEA3` di atas latar putih atau abu-abu sangat muda.
- Mobile-first. Operator memakai bottom navigation sederhana (Input, Riwayat, Profil). Admin dan manajer memakai sidebar di desktop dan menu ringkas di ponsel.
- Font sans-serif modern, dengan angka KPI yang tegas dan mudah dibaca.
- Tersedia loading skeleton, empty state yang informatif, pesan error dengan langkah pemulihan, dan konfirmasi untuk tindakan berisiko.
- Format angka dan tanggal Indonesia, zona waktu WIB.
- Smart TV memakai tema gelap berkontras tinggi agar terbaca dari jauh.

## Tahapan implementasi
**Fase 1 — MVP (dibangun sekarang)**
- Fondasi: login, role, master data (departemen, produk, line, pengguna), shift, blok, istirahat, dan target (termasuk target per blok).
- Input Sewing (+1 PCS dan input jumlah), input Printing, dan input Packing, dengan perlindungan anti-duplikat.
- Grid blok berwarna di halaman operator dan Smart TV.
- Riwayat transaksi, koreksi dan pembatalan dengan alasan, serta audit log.
- Dashboard manajer dengan KPI, grafik utama, filter, dan pembaruan otomatis.
- Live Production Board Smart TV dengan link bertoken.
- PWA dasar, seed data demo yang ditandai jelas, pengujian otomatis untuk perhitungan blok, anti-duplikat, otorisasi, agregasi, dan koreksi, serta dokumentasi setup NeonDB dan Vercel.

**Fase 2 — Laporan dan analisis**
- Laporan harian dan laporan rentang tanggal.
- Analisis produktivitas: rata-rata per blok, konsistensi antarblok, perubahan dibanding hari kerja sebelumnya, dan deteksi penurunan.
- Ekspor CSV, Excel, dan laporan cetak/PDF yang mengikuti filter, lengkap dengan info filter dan waktu pembuatan laporan.
- Drill-down lanjutan dan jadwal khusus (hari libur, lembur).

**Fase 3 — Hardening dan perluasan**
- Uji multiuser dan uji performa dengan volume transaksi besar.
- Antrean offline yang aman, opsional.
- Dimensi tambahan untuk Printing (shift dan mesin), panduan operator dan admin yang lengkap, verifikasi deployment production, serta kebijakan retensi dan backup.

## Asumsi
- Stack mengikuti prompt: Next.js App Router + TypeScript, NeonDB PostgreSQL, Drizzle, dan Vercel. **Anda perlu memberikan connection string NeonDB** (pooled dan direct), atau membuat database Neon terpisah untuk development. Preview di lingkungan Emergent bisa terbatas. Target deployment utamanya Vercel milik Anda.
- Login memakai username dan password dengan session cookie yang aman. Tidak ada pendaftaran mandiri dan tidak ada fitur lupa password lewat email; reset password dilakukan oleh admin.
- Nilai awal yang bisa diubah admin:
  - Satu shift 08.00–16.00 WIB, blok 45 menit, hari kerja Senin–Sabtu.
  - Istirahat 12.00–13.00, dikecualikan dari perhitungan blok.
  - Input di luar jam kerja ditolak.
  - Ambang "tanpa input" 15 menit, interval refresh dashboard 10 detik.
- Target per blok untuk setiap line diisi admin. Jika kosong, target per blok dihitung dari target harian dibagi jumlah blok produktif. Jika tidak ada target sama sekali, blok yang sudah berisi ditampilkan netral, bukan kuning atau hijau.
- Status warna blok dihitung dari total semua produk di line pada blok tersebut.
- Operator boleh mengoreksi input sendiri hanya jika diaktifkan admin, dengan batas default 15 menit setelah input. Pembatalan permanen tidak tersedia bagi siapa pun; pembatalan hanya mengubah status transaksi.
- "Total produksi" di dashboard ditampilkan per tahap. Angka utama yang dipakai untuk capaian target adalah Packing (barang jadi), dan pilihan ini bisa diubah admin.
- Pembaruan real-time memakai polling terkontrol, bukan layanan push.
- Seed demo (3 departemen, Line 1–3, beberapa produk, akun tiap role, dan transaksi simulasi) hanya berjalan di development dan bisa dihapus dengan satu perintah sebelum go-live.
- Logo memakai placeholder [LOGO PT REDONE BERKAH MANDIRI] sampai file logo diberikan.

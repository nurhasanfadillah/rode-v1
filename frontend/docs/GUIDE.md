# Panduan Penggunaan, Hasil Uji & Keterbatasan

## Operator
1. Buka aplikasi di ponsel → login dengan akun dari Super Admin. (Opsional: Profil → *Pasang Aplikasi*.)
2. **Sewing**: line & departemen otomatis termuat. Pilih produk (bisa dicari) → tekan **+1 PCS** setiap 1 pcs selesai. Notifikasi hijau "Tersimpan di server" = sudah tersimpan. Bila diizinkan admin, gunakan *Input jumlah* untuk beberapa pcs sekaligus.
3. Grid blok menunjukkan status tiap blok (abu-abu/merah/kuning/hijau + ikon). Blok yang sedang berjalan diberi bingkai.
4. **Printing/Packing**: pilih tanggal kerja (default hari ini), produk, isi jumlah, catatan opsional → *Simpan hasil*.
5. Banner merah "offline" = data **tidak** tersimpan; tunggu koneksi lalu ulangi. Pengiriman ulang otomatis aman (anti-duplikat).
6. **Riwayat** → ketuk transaksi → *Koreksi*/*Batalkan* (jika diizinkan admin, dalam batas waktu, wajib alasan).

## Manajer
- **Dashboard**: KPI per departemen (tidak dijumlahkan sebagai produksi unik), capaian target (acuan default Packing), line aktif, produk tertinggi, waktu data server. Pembaruan otomatis (default 10 dtk; berhenti saat tab tidak aktif).
- Filter tanggal/rentang, departemen, line, shift, produk, operator berlaku ke semua KPI, grafik, tabel.
- Klik KPI/line/produk → **drill-down** ke Riwayat dengan filter yang sama untuk menelusuri transaksi sumber.
- Peringkat line ditampilkan bersama target, produk yang dikerjakan, dan grid blok — bandingkan dengan konteks, bukan total pcs saja.

## Super Admin
- **Master Data**: produk, line (jumlah tak dibatasi, urutan tampil), pengguna (role, departemen, line, reset password, nonaktif), departemen (tipe harian atau per line & blok). Tidak ada hapus — gunakan nonaktif.
- **Jadwal & Blok**: buat versi jadwal per shift (jam, durasi blok, hari kerja, istirahat & mode, aturan luar jam) berlaku mulai tanggal tertentu, dengan pratinjau blok.
- **Target**: target harian departemen/line & target per blok, berversi.
- **Pengaturan & TV**: aturan input jumlah, koreksi operator/manajer, interval refresh, ambang idle, acuan target; buat/cabut link Smart TV (token hanya tampil sekali).
- **Audit Log**: login, koreksi, pembatalan, perubahan konfigurasi (before/after).

## Smart TV
Buka link `/display/production?token=...` di browser TV → tombol layar penuh di kanan atas. Layar menampilkan status koneksi, jam WIB tersinkron server, dan menyambung ulang otomatis. Mode: semua / Sewing / Printing+Packing / satu line / rotasi.

## Hasil pengujian otomatis (`yarn test`)
`tests/time.test.ts` & `tests/services.test.ts` (PGlite in-memory) — 25 skenario lulus, mencakup:
- Batas blok 08.00/08.44:59.999/08.45/09.30/10.15, akhir shift eksklusif, zona waktu server, istirahat dikecualikan, mode clock, hari libur, clamp, shift malam, versi jadwal.
- #1 12 + 15 pcs = 27 (produk & line); #2 08.45 = Blok 2; #3 retry tidak menggandakan; #4 Printing/Packing per tanggal & produk.
- #5/#6 koreksi & pembatalan memperbarui total, jejak audit, konflik versi (409); batas waktu koreksi operator.
- #9/#12 otorisasi: 401/403, manajer tidak bisa input, operator tidak bisa melihat/mengubah transaksi orang lain (IDOR → 404).
- #10 versi jadwal baru tidak mengubah hari sebelumnya; tanggal lampau ditolak.

## Keterbatasan / belum selesai (Fase 2–3)
- Laporan harian/rentang khusus, analisis produktivitas lanjutan, ekspor CSV/Excel/PDF/cetak — **belum** (Fase 2). Dashboard sudah mendukung rentang tanggal & drill-down.
- Jadwal khusus (libur nasional, lembur per tanggal) belum ada; gunakan versi jadwal.
- Real-time memakai polling terkontrol (bukan push/WebSocket).
- Antrean offline tidak diimplementasikan (sengaja: input ditolak saat offline).
- Rate limit in-memory per instance (di Vercel bersifat per-instance; lockout login tetap di DB).
- Logo memakai placeholder "R" — ganti dengan [LOGO PT REDONE BERKAH MANDIRI].
- Belum diverifikasi pada NeonDB/Vercel milik perusahaan (pratinjau memakai PGlite).

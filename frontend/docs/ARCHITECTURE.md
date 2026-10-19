# Arsitektur, Database, Role & Aturan Blok

## Lapisan
UI (client components, SWR) → Route Handler `/api/*` (validasi Zod, cek Origin/CSRF, `requireUser(roles)`) → Services (business logic, transaksi DB) → Drizzle → PostgreSQL.
Semua akses DB hanya di server. Pemeriksaan role ada di API & halaman server (bukan hanya menyembunyikan tombol).

## Relasi tabel

| Tabel | Isi | Relasi |
|---|---|---|
| `departments` | Printing/Sewing/Packing (+ baru). `kind`: `line_block` (per line & blok) / `daily` | — |
| `production_lines` | Line Sewing, urutan tampil, aktif | → departments |
| `products` | kode unik, nama, kategori, satuan, target default | — |
| `users` | nama, username unik, hash bcrypt, role, departemen, line | → departments, production_lines |
| `sessions` | hash token sesi + kedaluwarsa | → users |
| `login_attempts` | hitungan gagal & lockout | — |
| `shifts` | shift (S1, S2…) | — |
| `shift_versions` | **versi** jadwal per `effective_from`: jam mulai/akhir, durasi blok, hari kerja, mode istirahat, aturan di luar jam | → shifts |
| `shift_breaks` | istirahat per versi | → shift_versions |
| `production_targets` | target harian / per blok per departemen atau line, berversi `effective_from` | → departments, production_lines |
| `production_transactions` | transaksi sumber: dept, line (nullable), produk, qty (>0), operator, `work_date`, shift, versi shift, `block_no`, `recorded_at` (server), status, `idempotency_key` (UNIQUE), `version` (optimistic lock), `is_demo` | → semua master |
| `transaction_corrections` | nilai lama/baru, status lama/baru, alasan, pelaku, waktu | → production_transactions, users |
| `audit_logs` | login, koreksi, pembatalan, perubahan konfigurasi (before/after) | → users |
| `display_settings` | token Smart TV (hash), mode, line, rotasi, aktif/dicabut | → production_lines |
| `app_settings` | aturan input/koreksi, interval refresh, ambang idle, departemen acuan target | — |

Idempotensi memakai UNIQUE `production_transactions.idempotency_key` (mekanisme setara tabel `idempotency_keys`): permintaan ulang dengan kunci sama mengembalikan transaksi yang sama (HTTP 200, `duplicate:true`), kunci milik user lain → 409.
Index: `(work_date, department_id)`, `(line_id, work_date)`, `(product_id, work_date)`, `(operator_id, work_date)`, `recorded_at`, `updated_at`.
Agregat **tidak disimpan**; semua KPI dihitung dengan `SUM ... GROUP BY` dari transaksi berstatus ≠ `cancelled` oleh satu service (`services/aggregate.ts`) yang dipakai halaman operator, dashboard, dan Smart TV — sehingga angka selalu konsisten.

## Role & hak akses

| Kemampuan | Operator | Manajer | Super Admin |
|---|:-:|:-:|:-:|
| Input produksi (dept/line sesuai penugasan) | ✔ | ✘ | ✔ (pilih dept/line) |
| Riwayat transaksi | milik sendiri | semua | semua |
| Koreksi/pembatalan | milik sendiri, bila diizinkan & dalam batas waktu | bila `managerCanCorrect` | ✔ |
| Dashboard & filter, drill-down | ✘ | ✔ | ✔ |
| Lihat target | ✘ | ✔ (API) | ✔ |
| Master data, jadwal, target, pengaturan, Smart TV, audit log | ✘ | ✘ | ✔ |
| Hapus permanen transaksi | ✘ | ✘ | ✘ (hanya pembatalan beraudit) |

Smart TV memakai token terpisah (disimpan sebagai hash SHA-256, dapat dicabut), hanya membaca endpoint `/api/display`, tanpa data pribadi operator.

## Aturan blok waktu (`src/lib/time.ts`)

- Zona waktu tetap **Asia/Jakarta (UTC+7, tanpa DST)**. Waktu pencatatan = waktu server saat request diterima.
- Interval **setengah terbuka** `[mulai, akhir)`: 08.45 tepat masuk Blok 2; 16.00 tepat (akhir shift) di luar jam kerja.
- Mode `clock`: `blok = floor((t − mulai_shift) / durasi) + 1` (istirahat berada di dalam blok).
- Mode `exclude` (default): rumus sama tetapi memakai **menit produktif** (istirahat dikurangkan) — jam blok "berhenti" selama istirahat. Default 08.00–16.00, istirahat 12.00–13.00, 45 menit → 10 blok (B6 = 11.45–12.00 + 13.00–13.30, B10 = 15.45–16.00 parsial).
- Input saat istirahat (mode exclude) masuk ke blok yang sedang berjalan sebelum istirahat.
- Shift melewati tengah malam: jam setelah 00.00 masuk ke tanggal kerja hari shift dimulai.
- Di luar jam / hari libur: `reject` (default, HTTP 422) atau `clamp` (blok pertama/terakhir).
- Target blok = target per blok line, atau target harian ÷ blok produktif; blok parsial diprorata menurut menit produktif.
- Warna blok: abu-abu (belum dimulai), merah (sudah berjalan, 0 pcs), kuning (di bawah target), hijau (target tercapai), biru netral (ada hasil, tanpa target). Istirahat ditandai terpisah dan tidak pernah merah. Selalu ditambah ikon + label.
- Status line "tanpa input" hanya saat jam produktif: selisih dari max(input terakhir, mulai shift, akhir istirahat terakhir) > ambang (default 15 mnt).
- Versi jadwal & target berlaku mulai tanggal tertentu (tidak boleh di masa lalu; versi jadwal hari ini ditolak bila sudah ada transaksi). Transaksi menyimpan `shift_version_id` dan `block_no` saat dicatat, sehingga histori tidak berubah.

# RODE — Redone Output Data Entry

Sistem pencatatan & monitoring produksi real-time untuk **PT REDONE BERKAH MANDIRI** (Printing, Sewing per line & blok waktu, Packing).
Next.js 15 App Router + TypeScript · Tailwind · Drizzle ORM · PostgreSQL (NeonDB) · Zod · SWR polling · Recharts · PWA.

## Struktur

```
src/app/            halaman (App Router) + route handler API (/api/*)
src/app/api/        auth, meta, transactions, operator/summary, dashboard, display, admin/*
src/services/       business logic (transactions, aggregate, schedule, targets, master, display, settings, seed)
src/lib/time.ts     SATU-SATUNYA logika tanggal kerja / shift / blok (dipakai server, UI pratinjau, tes)
src/lib/auth.ts     session (cookie httpOnly + tabel sessions), bcrypt, lockout, rate limit, requireRole
src/db/             schema Drizzle + koneksi (Neon/pg pool atau PGlite lokal) + migrator
drizzle/            file migrasi SQL (dilacak git)
scripts/            migrate, seed, purge-demo
tests/              vitest: blok waktu, idempotensi, otorisasi, agregasi, koreksi
docs/               ARCHITECTURE.md (DB, role, aturan blok) · GUIDE.md (panduan & keterbatasan)
```

## Environment

Salin `.env.example` → `.env.local` (lokal) atau isi di Vercel Project Settings → Environment Variables, terpisah untuk **Development / Preview / Production**:

| Variabel | Keterangan |
|---|---|
| `APP_ENV` | `development` / `preview` / `production`. Seed demo ditolak bila `production`. |
| `DATABASE_URL` | Neon **pooled** connection string (host `...-pooler...`, `sslmode=require`) untuk trafik aplikasi serverless. `pglite://./.data/pglite` = Postgres embedded untuk dev tanpa Neon. |
| `DATABASE_URL_UNPOOLED` | Neon **direct** connection — dipakai `yarn db:migrate` & drizzle-kit. |
| `AUTO_MIGRATE` | `true` hanya untuk lokal/PGlite (migrasi + base seed saat server start). Di Vercel: `false`. |
| `DEMO_SEED` | `true` hanya dev/demo. **Jangan pernah** di production. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Super Admin pertama (dibuat jika belum ada super admin). |
| `SESSION_HOURS` | Masa berlaku sesi (default 12 jam). |
| `DB_POOL_MAX` | Ukuran pool pg per instance (default 5). |

Secret hanya ada di server. Tidak ada variabel `NEXT_PUBLIC_*` yang memuat kredensial.

## NeonDB

1. Buat project Neon (region terdekat, mis. `aws-ap-southeast-1`), database `rode`.
2. Buat branch terpisah: `main` (production), `preview`, `dev`.
3. Ambil 2 connection string per branch: **Pooled** → `DATABASE_URL`, **Direct** → `DATABASE_URL_UNPOOLED`.
4. Jalankan migrasi dari mesin lokal/CI: `DATABASE_URL_UNPOOLED=... yarn db:migrate`
5. Base data (departemen, shift default, pengaturan, super admin): `yarn db:seed` (dengan `DEMO_SEED=false` untuk production).
6. Perubahan skema: ubah `src/db/schema.ts` → `yarn db:generate` → commit file di `drizzle/` → `yarn db:migrate`.

## Deploy Vercel

1. Import repo, **Root Directory = `frontend`**, framework Next.js, install `yarn install`, build `yarn build`.
2. Isi env per environment (lihat tabel). `AUTO_MIGRATE=false`.
3. Jalankan `yarn db:migrate` ke branch Neon yang sesuai **sebelum** promote deployment (bisa via GitHub Action).
4. Verifikasi: login admin, buat produk/line/user nyata, input uji, cek dashboard & link Smart TV.

> Catatan preview Emergent: di lingkungan pratinjau, ingress meneruskan `/api/*` ke port 8001; `backend/server.py` hanya proxy tipis ke Next.js (port 3000). Tidak dipakai di Vercel.

## Perintah

```
yarn start            # dev server (Turbopack)
yarn build && yarn serve
yarn test             # vitest (PGlite in-memory, tidak menyentuh DB nyata)
yarn typecheck
yarn db:migrate | db:seed | db:generate
yarn db:purge-demo --confirm   # hapus seluruh data demo sebelum go-live
```

## Menghapus data demo sebelum go-live

Data demo ditandai `is_demo=true` (produk kode `DM-*`, line `SEW-L1..3`, akun `manajer`, `op.*`) dan ditampilkan dengan label **DEMO** di UI.
1. Backup database (Neon: buat branch snapshot).
2. `yarn db:purge-demo --confirm` — menghapus transaksi demo + transaksi milik akun demo, koreksinya, akun demo, sesi; produk/line demo dihapus bila tidak dipakai transaksi nyata.
3. Set `DEMO_SEED=false`.

## Retensi & backup (rekomendasi)

- Transaksi & audit log **tidak pernah dihapus** oleh aplikasi; pembatalan hanya mengubah status.
- Neon: aktifkan Point-in-Time Restore (≥7 hari, rekomendasi 30 hari) + snapshot branch bulanan.
- Ekspor bulanan tabel `production_transactions`, `transaction_corrections`, `audit_logs` ke penyimpanan arsip; simpan ≥ 5 tahun atau sesuai kebijakan perusahaan.
- Tabel `sessions` kedaluwarsa dapat dibersihkan berkala (`DELETE FROM sessions WHERE expires_at < now()`).

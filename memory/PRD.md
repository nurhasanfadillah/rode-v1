# RODE — PRD

## Original problem statement
MASTER PROMPT — REAL-TIME PRODUCTION MANAGEMENT SYSTEM (RODE — Redone Output Data Entry, PT REDONE BERKAH MANDIRI). Enterprise production monitoring & work management, mobile-first PWA. Next.js App Router + TypeScript, Tailwind, NeonDB PostgreSQL, Drizzle, Vercel, Zod, React Hook Form, charts, PWA. Roles Operator/Manajer/Super Admin with backend RBAC; departments Printing, Sewing (lines, 45-min blocks from 08.00 WIB, half-open intervals, 08.45 → Blok 2), Packing; idempotent input; auditable corrections; manager dashboard; Smart TV board /display/production with revocable token; reports & export; versioned config; demo seed; automated tests; docs (NeonDB, Vercel, roles, block rules, guides, limitations). (Full original prompt is in the first conversation message; approved plan adds a colored block grid vs per-block target.)

## Architecture
- /app/frontend = Next.js 15 app (pages + API route handlers /api/*), Drizzle schema + SQL migrations in /drizzle, services layer, single time/block engine src/lib/time.ts.
- DB: Neon via `pg` pool (DATABASE_URL pooled, DATABASE_URL_UNPOOLED for migrations); preview uses PGlite (pglite://./.data/pglite) with AUTO_MIGRATE.
- Preview only: /app/backend/server.py proxies /api/* (ingress → 8001) to Next.js :3000.
- Auth: username/password, bcrypt, DB sessions (httpOnly cookie), lockout 5 fails/15 min, rate limit, Origin CSRF check.
- Realtime: SWR controlled polling (pauses when tab hidden).

## User personas
Operator (mobile input), Manajer (monitoring), Super Admin (configuration), Smart TV (read-only board).

## Core requirements (static)
See original statement: RBAC on server, idempotency, aggregates from source transactions, corrections with audit, versioned schedule/targets, WIB, Indonesian formats, PWA, demo data separable.

## Implemented (2026-10-19) — Phase 1 MVP
- Schema (15 tables) + migration 0000_init, base seed, demo seed (flagged is_demo), purge-demo & cleanup scripts.
- Login/logout/session, RBAC, audit log.
- Sewing +1 PCS / bulk input with server-time block resolution, colored block grid; Printing/Packing daily input.
- History with filters/pagination, correction/cancel with reason, optimistic version conflict.
- Manager dashboard: KPIs, metric definition, idle lines, 4 charts, line ranking w/ grids, product table, global filters, drill-down to history.
- Admin: master data CRUD (search/filter/pagination), schedule versions w/ preview, versioned targets, settings, Smart TV tokens, audit log viewer.
- Smart TV board (modes all/sewing/print_pack/line/rotate, connection indicator, server-synced clock, fullscreen).
- PWA manifest, icons, service worker (no API caching), install button, offline banner.
- Tests: 25 vitest (blocks, idempotency, authz, aggregation, corrections, config history) pass; backend API pytest 36/36 after fix; frontend E2E iteration_1 passed (product unit bug fixed).
- Docs: frontend/README.md, docs/ARCHITECTURE.md, docs/GUIDE.md.

## Backlog
- P0: Connect customer NeonDB (pooled + direct strings) & deploy to Vercel; verify production.
- P1 (Phase 2): daily & range reports, productivity analysis, CSV/Excel/print/PDF export with filter info, special schedules (holidays/overtime).
- P2 (Phase 3): multi-user/perf load tests, optional safe offline queue, Printing machine/shift dimensions, real company logo, shadcn date picker with Indonesian format.

## Next tasks
Get Neon connection strings → run db:migrate/db:seed → Vercel deploy; then Phase 2 reports & export.

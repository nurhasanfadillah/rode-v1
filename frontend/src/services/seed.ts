import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appSettings, auditLogs, departments, productionLines, productionTargets, productionTransactions as T, products, sessions,
  shifts, shiftBreaks, shiftVersions, transactionCorrections, users,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { addDays, buildDayPlan, isWorkDay, jakartaInstant, todayJakarta } from "@/lib/time";
import { configsFor, loadSchedule } from "./schedule";
import { DEFAULT_SETTINGS } from "./settings";

const BASE_DEPARTMENTS = [
  { code: "PRINTING", name: "Printing", kind: "daily" as const, sortOrder: 1 },
  { code: "SEWING", name: "Sewing", kind: "line_block" as const, sortOrder: 2 },
  { code: "PACKING", name: "Packing", kind: "daily" as const, sortOrder: 3 },
];

/** Base configuration needed in every environment (idempotent). */
export async function ensureBaseData() {
  await db.insert(departments).values(BASE_DEPARTMENTS).onConflictDoNothing({ target: departments.code });
  const [shift] = await db.insert(shifts).values({ code: "S1", name: "Shift 1", sortOrder: 1 })
    .onConflictDoNothing({ target: shifts.code }).returning();
  if (shift) {
    const [v] = await db.insert(shiftVersions).values({
      shiftId: shift.id, effectiveFrom: "2024-01-01", startTime: "08:00", endTime: "16:00", blockMinutes: 45,
      workDays: [1, 2, 3, 4, 5, 6], breakMode: "exclude", outsidePolicy: "reject", note: "Konfigurasi awal",
    }).returning();
    await db.insert(shiftBreaks).values({ shiftVersionId: v.id, startTime: "12:00", endTime: "13:00", label: "Istirahat siang" });
  }
  await db.insert(appSettings).values({ key: "general", value: DEFAULT_SETTINGS }).onConflictDoNothing({ target: appSettings.key });

  const u = process.env.ADMIN_USERNAME?.toLowerCase();
  const p = process.env.ADMIN_PASSWORD;
  if (u && p) {
    const [envAdmin] = await db.select().from(users).where(eq(users.username, u));
    if (envAdmin?.role === "super_admin" && !(await verifyPassword(p, envAdmin.passwordHash))) {
      await db.update(users).set({ passwordHash: await hashPassword(p), updatedAt: new Date() }).where(eq(users.id, envAdmin.id));
    }
  }
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  if (!admin && u && p) {
    await db.insert(users).values({ fullName: "Super Admin", username: u.toLowerCase(), passwordHash: await hashPassword(p), role: "super_admin" })
      .onConflictDoNothing({ target: users.username });
  }
}

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** DEMO ONLY: lines, products, accounts and simulated past transactions flagged is_demo=true. */
export async function seedDemo() {
  if (process.env.APP_ENV === "production") throw new Error("Seed demo ditolak di production.");
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.isDemo, true)).limit(1);
  if (existing) return;
  const depts = await db.select().from(departments);
  const dep = (c: string) => depts.find((d) => d.code === c)!;
  const sewing = dep("SEWING");
  const lines = await db.insert(productionLines).values([1, 2, 3].map((n) => ({
    departmentId: sewing.id, code: `SEW-L${n}`, name: `Line ${n}`, sortOrder: n, isDemo: true,
  }))).onConflictDoNothing().returning();
  const prods = await db.insert(products).values([
    ["DM-JSC-01", "JISOI CLUTA", "Tas"], ["DM-KPB-02", "KAOS POLOS BASIC", "Kaos"], ["DM-KMF-03", "KEMEJA FORMAL", "Kemeja"],
    ["DM-CCH-04", "CELANA CHINO", "Celana"], ["DM-JHD-05", "JAKET HOODIE", "Jaket"],
  ].map(([code, name, category]) => ({ code, name, category, isDemo: true, notes: "Data demo" }))).onConflictDoNothing().returning();

  const today = todayJakarta();
  await db.insert(productionTargets).values([
    ...lines.map((l) => ({ departmentId: sewing.id, lineId: l.id, effectiveFrom: "2024-01-01", dailyTarget: 400, blockTarget: 45 })),
    { departmentId: dep("PRINTING").id, effectiveFrom: "2024-01-01", dailyTarget: 1200 },
    { departmentId: dep("PACKING").id, effectiveFrom: "2024-01-01", dailyTarget: 1100 },
  ]);

  const opHash = await hashPassword("Operator123!");
  const mgrHash = await hashPassword("Manajer123!");
  const accounts = await db.insert(users).values([
    { fullName: "Manajer Produksi (Demo)", username: "manajer", passwordHash: mgrHash, role: "manager" as const, isDemo: true },
    ...lines.map((l, i) => ({
      fullName: `Operator Sewing ${i + 1} (Demo)`, username: `op.sewing${i + 1}`, passwordHash: opHash, role: "operator" as const,
      departmentId: sewing.id, lineId: l.id, isDemo: true,
    })),
    { fullName: "Operator Printing (Demo)", username: "op.printing", passwordHash: opHash, role: "operator" as const, departmentId: dep("PRINTING").id, isDemo: true },
    { fullName: "Operator Packing (Demo)", username: "op.packing", passwordHash: opHash, role: "operator" as const, departmentId: dep("PACKING").id, isDemo: true },
  ]).onConflictDoNothing().returning();

  const schedule = await loadSchedule();
  const r = rng(42);
  const rows: (typeof T.$inferInsert)[] = [];
  for (let back = 6; back >= 1; back--) {
    const d = addDays(today, -back);
    const cfg = configsFor(schedule, d)[0];
    if (!cfg || !isWorkDay(cfg, d)) continue;
    const plan = buildDayPlan(cfg);
    lines.forEach((l, li) => {
      const op = accounts.find((a) => a.lineId === l.id)!;
      plan.blocks.forEach((b) => {
        const p = prods[(li + b.no) % 3];
        const qty = Math.max(1, Math.round((b.productiveMinutes / cfg.blockMinutes) * (32 + r() * 20)));
        const at = jakartaInstant(d, b.segments[0].start + Math.min(10, b.productiveMinutes / 2));
        rows.push({
          departmentId: sewing.id, lineId: l.id, productId: p.id, quantity: qty, originalQuantity: qty, operatorId: op.id, workDate: d,
          shiftId: cfg.shiftId, shiftVersionId: cfg.shiftVersionId, blockNo: b.no, recordedAt: at, inputMode: "bulk",
          idempotencyKey: `demo-${d}-${l.code}-${b.no}`, isDemo: true, createdAt: at, updatedAt: at, notes: "Simulasi demo",
        });
      });
    });
    for (const code of ["PRINTING", "PACKING"]) {
      const op = accounts.find((a) => a.departmentId === dep(code).id && a.role === "operator")!;
      prods.slice(0, 4).forEach((p, pi) => {
        const qty = Math.round(200 + r() * 150);
        const at = jakartaInstant(d, 15 * 60 + pi * 5);
        rows.push({
          departmentId: dep(code).id, productId: p.id, quantity: qty, originalQuantity: qty, operatorId: op.id, workDate: d,
          recordedAt: at, inputMode: "daily", idempotencyKey: `demo-${d}-${code}-${p.code}`, isDemo: true, createdAt: at, updatedAt: at,
          notes: "Simulasi demo", shiftId: cfg.shiftId, shiftVersionId: cfg.shiftVersionId,
        });
      });
    }
  }
  for (let i = 0; i < rows.length; i += 200) await db.insert(T).values(rows.slice(i, i + 200)).onConflictDoNothing();
  console.log(`[seed] demo data created: ${lines.length} lines, ${prods.length} products, ${accounts.length} users, ${rows.length} transactions`);
}

/** Remove demo data before go-live. Real master data that is referenced by real transactions is kept. */
export async function purgeDemo() {
  const demoUsers = (await db.select({ id: users.id }).from(users).where(eq(users.isDemo, true))).map((u) => u.id);
  const txCond = demoUsers.length ? or(eq(T.isDemo, true), inArray(T.operatorId, demoUsers)) : eq(T.isDemo, true);
  return db.transaction(async (tx) => {
    const txIds = (await tx.select({ id: T.id }).from(T).where(txCond)).map((t) => t.id);
    for (let i = 0; i < txIds.length; i += 500) {
      const chunk = txIds.slice(i, i + 500);
      await tx.delete(transactionCorrections).where(inArray(transactionCorrections.transactionId, chunk));
      await tx.delete(T).where(inArray(T.id, chunk));
    }
    if (demoUsers.length) {
      await tx.delete(transactionCorrections).where(inArray(transactionCorrections.correctedBy, demoUsers));
      await tx.delete(sessions).where(inArray(sessions.userId, demoUsers));
      await tx.update(auditLogs).set({ userId: null }).where(inArray(auditLogs.userId, demoUsers));
      await tx.delete(users).where(inArray(users.id, demoUsers));
    }
    await tx.delete(products).where(and(eq(products.isDemo, true), sql`not exists (select 1 from production_transactions t where t.product_id = ${products.id})`));
    const demoLines = (await tx.select({ id: productionLines.id }).from(productionLines).where(eq(productionLines.isDemo, true))).map((l) => l.id);
    if (demoLines.length) {
      await tx.delete(productionTargets).where(inArray(productionTargets.lineId, demoLines));
      await tx.update(users).set({ lineId: null }).where(inArray(users.lineId, demoLines));
      await tx.delete(productionLines).where(and(inArray(productionLines.id, demoLines), sql`not exists (select 1 from production_transactions t where t.line_id = ${productionLines.id})`));
    }
    return { transactions: txIds.length, users: demoUsers.length, lines: demoLines.length };
  });
}

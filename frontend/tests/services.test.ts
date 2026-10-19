import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runMigrations } from "@/db/migrate";
import { auditLogs, departments, productionLines, productionTargets, productionTransactions, products, transactionCorrections, users } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { requireRole, type SessionUser } from "@/lib/auth";
import { addDays, jakartaInstant, todayJakarta } from "@/lib/time";
import { getDashboard } from "@/services/aggregate";
import { createVersion } from "@/services/schedule";
import { ensureBaseData } from "@/services/seed";
import { amendTransaction, createTransaction, getTransaction, listTransactions } from "@/services/transactions";

const DAY = "2026-10-19";
const at = (h: number, m: number) => jakartaInstant(DAY, h * 60 + m);
let sewing: string, packing: string, line1: string, line2: string, prod: string;
let op1: SessionUser, op2: SessionUser, opPack: SessionUser, mgr: SessionUser, admin: SessionUser;

async function mkUser(role: SessionUser["role"], username: string, departmentId: string | null = null, lineId: string | null = null): Promise<SessionUser> {
  const [u] = await db.insert(users).values({ fullName: username, username, passwordHash: "x", role, departmentId, lineId }).returning();
  return { id: u.id, fullName: u.fullName, username, role, departmentId, lineId };
}
const key = () => `test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const expectErr = async (p: Promise<unknown>, status: number) => {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.status === status);
};

beforeAll(async () => {
  await runMigrations();
  await ensureBaseData();
  const depts = await db.select().from(departments);
  sewing = depts.find((d) => d.code === "SEWING")!.id;
  packing = depts.find((d) => d.code === "PACKING")!.id;
  [line1, line2] = (await db.insert(productionLines).values([
    { departmentId: sewing, code: "T-L1", name: "Line 1" }, { departmentId: sewing, code: "T-L2", name: "Line 2" },
  ]).returning()).map((l) => l.id);
  prod = (await db.insert(products).values({ code: "T-JSC", name: "JISOI CLUTA" }).returning())[0].id;
  await db.insert(productionTargets).values({ departmentId: sewing, lineId: line1, effectiveFrom: "2024-01-01", dailyTarget: 400, blockTarget: 45 });
  op1 = await mkUser("operator", "t.op1", sewing, line1);
  op2 = await mkUser("operator", "t.op2", sewing, line2);
  opPack = await mkUser("operator", "t.pack", packing);
  mgr = await mkUser("manager", "t.mgr");
  admin = await mkUser("super_admin", "t.admin");
});

const lineTotal = async (lineId = line1) => (await getDashboard({ date: DAY, lineId }, at(15, 0))).lines.find((l) => l.id === lineId)!;

describe("sewing input, blocks and aggregation", () => {
  it("acceptance #1: 12 pcs in Block 1 + 15 pcs in Block 2 = 27 pcs per product and line", async () => {
    const a = await createTransaction(op1, { productId: prod, quantity: 12, idempotencyKey: key() }, at(8, 10));
    const b = await createTransaction(op1, { productId: prod, quantity: 15, idempotencyKey: key() }, at(8, 45));
    expect(a.transaction.blockNo).toBe(1);
    expect(b.transaction.blockNo).toBe(2);
    expect(b.transaction.workDate).toBe(DAY);
    const l = await lineTotal();
    expect(l.actual).toBe(27);
    expect(l.products).toEqual([{ id: prod, name: "JISOI CLUTA", qty: 27 }]);
    expect(l.blocks.find((x) => x.no === 1)).toMatchObject({ qty: 12, state: "partial", target: 45 });
    expect(l.blocks.find((x) => x.no === 2)?.qty).toBe(15);
    const d = await getDashboard({ date: DAY, departmentId: sewing }, at(15, 0));
    expect(d.products.find((p) => p.id === prod)?.byDept[sewing]).toBe(27);
  });

  it("operator line is forced from assignment (ignores body lineId)", async () => {
    const r = await createTransaction(op1, { productId: prod, quantity: 1, idempotencyKey: key(), lineId: line2 }, at(9, 0));
    expect(r.transaction.lineId).toBe(line1);
    expect(r.transaction.inputMode).toBe("single");
  });

  it("outside working hours is rejected", async () => {
    await expectErr(createTransaction(op1, { productId: prod, quantity: 1, idempotencyKey: key() }, at(7, 30)), 422);
  });
});

describe("idempotency (acceptance #3)", () => {
  it("retry with the same key does not double count", async () => {
    const before = (await lineTotal(line2)).actual;
    const k = key();
    const first = await createTransaction(op2, { productId: prod, quantity: 5, idempotencyKey: k }, at(10, 0));
    const retry = await createTransaction(op2, { productId: prod, quantity: 5, idempotencyKey: k }, at(10, 0));
    expect(retry.duplicate).toBe(true);
    expect(retry.transaction.id).toBe(first.transaction.id);
    expect((await lineTotal(line2)).actual).toBe(before + 5);
  });
  it("another user cannot reuse a key", async () => {
    const k = key();
    await createTransaction(op2, { productId: prod, quantity: 1, idempotencyKey: k }, at(10, 5));
    await expectErr(createTransaction(op1, { productId: prod, quantity: 1, idempotencyKey: k }, at(10, 5)), 409);
  });
});

describe("authorization", () => {
  it("requireRole rejects missing session (401) and wrong role (403)", () => {
    expect(() => requireRole(null)).toThrow(ApiError);
    expect(() => requireRole(op1, ["super_admin"])).toThrowError(/akses/);
    expect(requireRole(admin, ["super_admin"]).id).toBe(admin.id);
  });
  it("manager cannot create production transactions", async () => {
    await expectErr(createTransaction(mgr, { productId: prod, quantity: 1, idempotencyKey: key() }, at(9, 0)), 403);
  });
  it("operator only sees own transactions and gets 404 for others (IDOR)", async () => {
    const other = await createTransaction(op2, { productId: prod, quantity: 2, idempotencyKey: key() }, at(11, 0));
    const list = await listTransactions(op1, { page: 1, pageSize: 100, operatorId: op2.id });
    expect(list.items.every((t) => t.operatorId === op1.id)).toBe(true);
    await expectErr(getTransaction(op1, other.transaction.id), 404);
    await expectErr(amendTransaction(op1, other.transaction.id, "cancel", { reason: "bukan milik saya", expectedVersion: 1 }, null), 404);
  });
});

describe("printing/packing daily input (acceptance #4)", () => {
  it("records quantity by date and product; future date rejected", async () => {
    const r = await createTransaction(opPack, { productId: prod, quantity: 300, idempotencyKey: key(), workDate: DAY }, at(15, 0));
    expect(r.transaction).toMatchObject({ lineId: null, blockNo: null, workDate: DAY, inputMode: "daily" });
    const d = await getDashboard({ date: DAY, departmentId: packing }, at(15, 0));
    expect(d.departments[0].actual).toBe(300);
    await expectErr(createTransaction(opPack, { productId: prod, quantity: 1, idempotencyKey: key(), workDate: addDays(todayJakarta(), 1) }), 400);
  });
});

describe("corrections & cancellations (acceptance #5, #6)", () => {
  it("correction updates totals and leaves audit trail; cancellation excludes from totals", async () => {
    const t = await createTransaction(op1, { productId: prod, quantity: 20, idempotencyKey: key() }, at(14, 0));
    const before = (await lineTotal()).actual;
    const c = await amendTransaction(admin, t.transaction.id, "correct", { newQuantity: 8, reason: "salah input jumlah", expectedVersion: 1 }, "127.0.0.1");
    expect(c).toMatchObject({ quantity: 8, status: "corrected", version: 2, originalQuantity: 20 });
    expect((await lineTotal()).actual).toBe(before - 12);
    const corr = await db.select().from(transactionCorrections).where(eq(transactionCorrections.transactionId, t.transaction.id));
    expect(corr[0]).toMatchObject({ oldQuantity: 20, newQuantity: 8, reason: "salah input jumlah", correctedBy: admin.id });
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, t.transaction.id), eq(auditLogs.action, "transaction.correct")));
    expect(logs).toHaveLength(1);

    await expectErr(amendTransaction(admin, t.transaction.id, "cancel", { reason: "versi lama", expectedVersion: 1 }, null), 409);
    await amendTransaction(admin, t.transaction.id, "cancel", { reason: "transaksi ganda", expectedVersion: 2 }, null);
    expect((await lineTotal()).actual).toBe(before - 20);
    expect((await getTransaction(admin, t.transaction.id)).corrections).toHaveLength(2);
    await expectErr(amendTransaction(admin, t.transaction.id, "cancel", { reason: "lagi lagi", expectedVersion: 3 }, null), 409);
  });
  it("operator correction outside the allowed window is forbidden", async () => {
    const t = await createTransaction(op1, { productId: prod, quantity: 3, idempotencyKey: key() }, at(14, 30));
    await db.update(productionTransactions).set({ createdAt: new Date(Date.now() - 60 * 60_000) }).where(eq(productionTransactions.id, t.transaction.id));
    await expectErr(amendTransaction(op1, t.transaction.id, "correct", { newQuantity: 2, reason: "salah hitung", expectedVersion: 1 }, null), 403);
  });
});

describe("configuration history (acceptance #10)", () => {
  it("new schedule version only applies from its effective date; past dates are rejected", async () => {
    const [shift] = await db.query.shifts.findMany();
    await expectErr(createVersion({
      shiftId: shift.id, effectiveFrom: addDays(todayJakarta(), -1), startTime: "07:00", endTime: "15:00", blockMinutes: 60,
      workDays: [1, 2, 3, 4, 5], breakMode: "exclude", outsidePolicy: "reject", breaks: [],
    }, admin.id, "t"), 400);
    const before = (await lineTotal()).blocks.map((b) => [b.no, b.start, b.qty]);
    await createVersion({
      shiftId: shift.id, effectiveFrom: addDays(todayJakarta() > DAY ? todayJakarta() : DAY, 1), startTime: "07:00", endTime: "15:00",
      blockMinutes: 60, workDays: [1, 2, 3, 4, 5], breakMode: "exclude", outsidePolicy: "reject", breaks: [],
    }, admin.id, "t");
    expect((await lineTotal()).blocks.map((b) => [b.no, b.start, b.qty])).toEqual(before);
  });
});

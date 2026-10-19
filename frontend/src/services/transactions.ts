import { and, count, desc, eq, gte, inArray, lte, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  departments, productionLines, products, productionTransactions as T, transactionCorrections, users,
} from "@/db/schema";
import { ApiError, forbidden, notFound } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import { addDays, resolveWorkContext, todayJakarta } from "@/lib/time";
import { configsFor, loadSchedule } from "./schedule";
import { audit, getSettings, type AppSettings } from "./settings";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

export const createTxSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1, "Minimal 1 pcs").max(100000),
  idempotencyKey: z.string().min(8).max(100),
  departmentId: z.string().uuid().optional(),
  lineId: z.string().uuid().optional(),
  workDate: dateStr.optional(),
  notes: z.string().max(500).optional().nullable(),
});
export type CreateTxInput = z.infer<typeof createTxSchema>;

export async function createTransaction(user: SessionUser, input: CreateTxInput, now = new Date()) {
  if (user.role === "manager") throw forbidden("Manajer tidak dapat mencatat transaksi produksi.");
  const existing = await findByKey(input.idempotencyKey);
  if (existing) return dedupe(user, existing);

  const deptId = user.role === "operator" ? user.departmentId : input.departmentId;
  if (!deptId) throw forbidden(user.role === "operator" ? "Akun Anda belum ditugaskan ke departemen." : "Pilih departemen.");
  const [dept] = await db.select().from(departments).where(eq(departments.id, deptId));
  if (!dept || !dept.isActive) throw new ApiError(400, "Departemen tidak aktif.");
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));
  if (!product || !product.isActive) throw new ApiError(400, "Produk tidak ditemukan atau tidak aktif.");
  const settings = await getSettings();
  const schedule = await loadSchedule();

  let values: typeof T.$inferInsert;
  const base = {
    departmentId: dept.id, productId: product.id, quantity: input.quantity, originalQuantity: input.quantity,
    operatorId: user.id, idempotencyKey: input.idempotencyKey, notes: input.notes ?? null, recordedAt: now,
    createdAt: now, updatedAt: now,
  };

  if (dept.kind === "line_block") {
    const lineId = user.role === "operator" ? user.lineId : input.lineId;
    if (!lineId) throw forbidden(user.role === "operator" ? "Akun Anda belum ditugaskan ke line." : "Pilih line.");
    const [line] = await db.select().from(productionLines).where(eq(productionLines.id, lineId));
    if (!line || !line.isActive || line.departmentId !== dept.id) throw new ApiError(400, "Line tidak valid atau tidak aktif.");
    if (input.quantity > 1 && !settings.allowBulkInput) throw new ApiError(403, "Input jumlah dinonaktifkan oleh admin.", "BULK_DISABLED");
    const ctx = resolveWorkContext(now, (d) => configsFor(schedule, d));
    if (!ctx.ok || !ctx.config) throw new ApiError(422, ctx.reason ?? "Di luar jam kerja.", "OUTSIDE_HOURS");
    values = {
      ...base, lineId: line.id, workDate: ctx.workDate, shiftId: ctx.config.shiftId, shiftVersionId: ctx.config.shiftVersionId,
      blockNo: ctx.blockNo, inputMode: input.quantity > 1 ? "bulk" : "single",
    };
  } else {
    const today = todayJakarta(now);
    const workDate = input.workDate ?? today;
    if (workDate > today) throw new ApiError(400, "Tanggal kerja tidak boleh di masa depan.");
    if (user.role === "operator" && workDate < addDays(today, -settings.allowBackdateDays)) {
      throw new ApiError(400, `Tanggal kerja maksimal ${settings.allowBackdateDays} hari ke belakang.`);
    }
    const ctx = resolveWorkContext(now, (d) => configsFor(schedule, d));
    const sameDay = ctx.ok && ctx.config && ctx.workDate === workDate;
    values = {
      ...base, lineId: null, workDate, shiftId: sameDay ? ctx.config!.shiftId : null,
      shiftVersionId: sameDay ? ctx.config!.shiftVersionId : null, blockNo: null, inputMode: "daily",
    };
  }

  const inserted = await db.insert(T).values(values).onConflictDoNothing({ target: T.idempotencyKey }).returning();
  if (inserted[0]) return { transaction: inserted[0], duplicate: false };
  const raced = await findByKey(input.idempotencyKey);
  if (!raced) throw new ApiError(500, "Gagal menyimpan transaksi.");
  return dedupe(user, raced);
}

async function findByKey(key: string) {
  const [row] = await db.select().from(T).where(eq(T.idempotencyKey, key));
  return row ?? null;
}

function dedupe(user: SessionUser, row: typeof T.$inferSelect) {
  if (row.operatorId !== user.id) throw new ApiError(409, "Kunci idempotensi sudah digunakan.", "IDEMPOTENCY_CONFLICT");
  return { transaction: row, duplicate: true };
}

export const listSchema = z.object({
  from: dateStr.optional(), to: dateStr.optional(),
  departmentId: z.string().uuid().optional(), lineId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(), operatorId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(), blockNo: z.coerce.number().int().optional(),
  status: z.enum(["active", "corrected", "cancelled", "valid"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListFilters = z.infer<typeof listSchema>;

export function canCorrect(user: SessionUser, tx: { operatorId: string; createdAt: Date; status: string }, s: AppSettings, now = new Date()) {
  if (tx.status === "cancelled") return false;
  if (user.role === "super_admin") return true;
  if (user.role === "manager") return s.managerCanCorrect;
  return s.operatorCorrectionEnabled && tx.operatorId === user.id
    && now.getTime() - tx.createdAt.getTime() <= s.operatorCorrectionWindowMin * 60000;
}

const txSelect = {
  id: T.id, workDate: T.workDate, recordedAt: T.recordedAt, quantity: T.quantity, originalQuantity: T.originalQuantity,
  status: T.status, blockNo: T.blockNo, inputMode: T.inputMode, notes: T.notes, version: T.version, isDemo: T.isDemo,
  createdAt: T.createdAt, updatedAt: T.updatedAt, operatorId: T.operatorId, departmentId: T.departmentId, lineId: T.lineId,
  productId: T.productId, shiftId: T.shiftId,
  departmentName: departments.name, lineName: productionLines.name, productName: products.name, productCode: products.code,
  operatorName: users.fullName,
};

export async function listTransactions(user: SessionUser, f: ListFilters) {
  const operatorId = user.role === "operator" ? user.id : f.operatorId;
  const conds: (SQL | undefined)[] = [
    f.from ? gte(T.workDate, f.from) : undefined, f.to ? lte(T.workDate, f.to) : undefined,
    f.departmentId ? eq(T.departmentId, f.departmentId) : undefined, f.lineId ? eq(T.lineId, f.lineId) : undefined,
    f.productId ? eq(T.productId, f.productId) : undefined, operatorId ? eq(T.operatorId, operatorId) : undefined,
    f.shiftId ? eq(T.shiftId, f.shiftId) : undefined, f.blockNo ? eq(T.blockNo, f.blockNo) : undefined,
    f.status === "valid" ? ne(T.status, "cancelled") : f.status ? eq(T.status, f.status) : undefined,
  ];
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(T).where(where);
  const rows = await db.select(txSelect).from(T)
    .innerJoin(departments, eq(departments.id, T.departmentId))
    .innerJoin(products, eq(products.id, T.productId))
    .innerJoin(users, eq(users.id, T.operatorId))
    .leftJoin(productionLines, eq(productionLines.id, T.lineId))
    .where(where).orderBy(desc(T.recordedAt)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
  const s = await getSettings();
  return {
    total, page: f.page, pageSize: f.pageSize,
    items: rows.map((r) => ({ ...r, canCorrect: canCorrect(user, r, s) })),
  };
}

export async function getTransaction(user: SessionUser, id: string) {
  const [row] = await db.select(txSelect).from(T)
    .innerJoin(departments, eq(departments.id, T.departmentId))
    .innerJoin(products, eq(products.id, T.productId))
    .innerJoin(users, eq(users.id, T.operatorId))
    .leftJoin(productionLines, eq(productionLines.id, T.lineId))
    .where(eq(T.id, id));
  if (!row || (user.role === "operator" && row.operatorId !== user.id)) throw notFound("Transaksi tidak ditemukan.");
  const corrections = await db.select({
    id: transactionCorrections.id, action: transactionCorrections.action, oldQuantity: transactionCorrections.oldQuantity,
    newQuantity: transactionCorrections.newQuantity, oldStatus: transactionCorrections.oldStatus,
    newStatus: transactionCorrections.newStatus, reason: transactionCorrections.reason, createdAt: transactionCorrections.createdAt,
    correctedByName: users.fullName,
  }).from(transactionCorrections).innerJoin(users, eq(users.id, transactionCorrections.correctedBy))
    .where(eq(transactionCorrections.transactionId, id)).orderBy(desc(transactionCorrections.createdAt));
  const s = await getSettings();
  return { ...row, canCorrect: canCorrect(user, row, s), corrections };
}

export const correctSchema = z.object({
  newQuantity: z.number().int().min(1, "Minimal 1 pcs").max(100000),
  reason: z.string().trim().min(5, "Alasan minimal 5 karakter").max(500),
  expectedVersion: z.number().int(),
});
export const cancelSchema = correctSchema.omit({ newQuantity: true });

export async function amendTransaction(
  user: SessionUser, id: string, action: "correct" | "cancel",
  input: { newQuantity?: number; reason: string; expectedVersion: number }, ip: string | null,
) {
  const s = await getSettings();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(T).where(eq(T.id, id)).for("update");
    if (!row || (user.role === "operator" && row.operatorId !== user.id)) throw notFound("Transaksi tidak ditemukan.");
    if (row.status === "cancelled") throw new ApiError(409, "Transaksi sudah dibatalkan.", "ALREADY_CANCELLED");
    if (!canCorrect(user, row, s)) throw forbidden("Anda tidak diizinkan mengoreksi transaksi ini (aturan koreksi admin).");
    if (row.version !== input.expectedVersion) {
      throw new ApiError(409, "Transaksi telah diubah pengguna lain. Muat ulang data lalu coba lagi.", "VERSION_CONFLICT");
    }
    const newStatus = action === "cancel" ? "cancelled" : "corrected";
    const newQuantity = action === "cancel" ? row.quantity : input.newQuantity!;
    if (action === "correct" && newQuantity === row.quantity) throw new ApiError(400, "Kuantitas baru sama dengan kuantitas saat ini.");
    const [updated] = await tx.update(T)
      .set({ quantity: newQuantity, status: newStatus, version: row.version + 1, updatedAt: new Date() })
      .where(eq(T.id, id)).returning();
    await tx.insert(transactionCorrections).values({
      transactionId: id, action, oldQuantity: row.quantity, newQuantity: action === "cancel" ? null : newQuantity,
      oldStatus: row.status, newStatus, reason: input.reason, correctedBy: user.id,
    });
    await audit(tx, {
      userId: user.id, action: `transaction.${action}`, entity: "production_transactions", entityId: id, ip,
      details: { oldQuantity: row.quantity, newQuantity: action === "cancel" ? null : newQuantity, reason: input.reason },
    });
    return updated;
  });
}

export async function recentOwn(userId: string, workDate: string, limit = 8) {
  return db.select({
    id: T.id, quantity: T.quantity, status: T.status, blockNo: T.blockNo, recordedAt: T.recordedAt, productName: products.name,
  }).from(T).innerJoin(products, eq(products.id, T.productId))
    .where(and(eq(T.operatorId, userId), eq(T.workDate, workDate), inArray(T.status, ["active", "corrected"])))
    .orderBy(desc(T.recordedAt)).limit(limit);
}

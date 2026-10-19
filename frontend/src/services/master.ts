import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, productionLines, products, sessions, users } from "@/db/schema";
import { ApiError, forbidden, notFound } from "@/lib/api";
import { hashPassword, type SessionUser } from "@/lib/auth";
import { audit } from "./settings";

const code = z.string().trim().min(1).max(30).transform((s) => s.toUpperCase());
const name = z.string().trim().min(1).max(120);
const optText = z.string().trim().max(500).optional().nullable().transform((v) => v || null);
const optInt = z.number().int().min(0).max(1_000_000).optional().nullable();
const uuidOpt = z.string().uuid().optional().nullable().or(z.literal("").transform(() => null));

const schemas = {
  departments: z.object({ code, name, kind: z.enum(["line_block", "daily"]), sortOrder: z.number().int().default(0), isActive: z.boolean().default(true) }),
  lines: z.object({ code, name, departmentId: z.string().uuid(), sortOrder: z.number().int().default(0), isActive: z.boolean().default(true) }),
  products: z.object({
    code, name, category: optText, unit: z.string().trim().min(1).max(20).default("PCS"), defaultTarget: optInt, notes: optText,
    isActive: z.boolean().default(true),
  }),
  users: z.object({
    fullName: name, username: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,60}$/, "3-60 karakter: huruf kecil, angka, . _ - @"),
    role: z.enum(["operator", "manager", "super_admin"]), departmentId: uuidOpt, lineId: uuidOpt, isActive: z.boolean().default(true),
    password: z.string().min(8, "Password minimal 8 karakter").max(100).optional(),
  }),
};
export type Entity = keyof typeof schemas;
export const ENTITIES = Object.keys(schemas) as Entity[];

const tables = { departments, lines: productionLines, products, users };

export const listQuery = z.object({
  q: z.string().optional(), active: z.enum(["true", "false"]).optional(), departmentId: z.string().uuid().optional(),
  role: z.enum(["operator", "manager", "super_admin"]).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export async function listEntity(entity: Entity, f: z.infer<typeof listQuery>) {
  const conds: (SQL | undefined)[] = [];
  const like = f.q ? `%${f.q}%` : null;
  if (entity === "users") {
    if (like) conds.push(or(ilike(users.fullName, like), ilike(users.username, like)));
    if (f.role) conds.push(eq(users.role, f.role));
    if (f.departmentId) conds.push(eq(users.departmentId, f.departmentId));
    if (f.active) conds.push(eq(users.isActive, f.active === "true"));
    const where = and(...conds);
    const [{ total }] = await db.select({ total: count() }).from(users).where(where);
    const items = await db.select({
      id: users.id, fullName: users.fullName, username: users.username, role: users.role, departmentId: users.departmentId,
      lineId: users.lineId, isActive: users.isActive, isDemo: users.isDemo, lastLoginAt: users.lastLoginAt,
      departmentName: departments.name, lineName: productionLines.name,
    }).from(users).leftJoin(departments, eq(departments.id, users.departmentId)).leftJoin(productionLines, eq(productionLines.id, users.lineId))
      .where(where).orderBy(asc(users.fullName)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    return { total, items, page: f.page, pageSize: f.pageSize };
  }
  const t = tables[entity] as typeof products;
  if (like) conds.push(or(ilike(t.code, like), ilike(t.name, like)));
  if (f.active) conds.push(eq(t.isActive, f.active === "true"));
  if (entity === "lines" && f.departmentId) conds.push(eq(productionLines.departmentId, f.departmentId));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(t).where(where);
  const order = entity === "products" ? [asc(products.name)] : [asc((t as unknown as typeof departments).sortOrder), asc(t.code)];
  const items = await db.select().from(t).where(where).orderBy(...order).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
  return { total, items, page: f.page, pageSize: f.pageSize };
}

async function validateUserAssignment(v: { role: string; departmentId?: string | null; lineId?: string | null }) {
  if (v.role !== "operator") return { departmentId: v.departmentId ?? null, lineId: v.lineId ?? null };
  if (!v.departmentId) throw new ApiError(400, "Operator wajib ditugaskan ke departemen.");
  const [d] = await db.select().from(departments).where(eq(departments.id, v.departmentId));
  if (!d) throw new ApiError(400, "Departemen tidak ditemukan.");
  if (d.kind === "line_block") {
    if (!v.lineId) throw new ApiError(400, `Operator ${d.name} wajib ditugaskan ke line.`);
    const [l] = await db.select().from(productionLines).where(eq(productionLines.id, v.lineId));
    if (!l || l.departmentId !== d.id) throw new ApiError(400, "Line tidak sesuai dengan departemen.");
    return { departmentId: d.id, lineId: l.id };
  }
  return { departmentId: d.id, lineId: null };
}

function uniqueErr(e: unknown): never {
  const msg = String((e as { message?: string; cause?: { message?: string } })?.cause?.message ?? (e as Error)?.message ?? "");
  if (/unique|duplicate/i.test(msg)) throw new ApiError(409, "Kode/username sudah digunakan.", "DUPLICATE");
  throw e;
}

export async function createEntity(entity: Entity, body: unknown, actor: SessionUser, ip: string) {
  const data = schemas[entity].parse(body) as Record<string, unknown>;
  let values: Record<string, unknown> = data;
  if (entity === "users") {
    if (!data.password) throw new ApiError(400, "Password wajib diisi untuk pengguna baru.");
    const { password, ...rest } = data;
    values = { ...rest, ...(await validateUserAssignment(rest as never)), passwordHash: await hashPassword(password as string) };
  }
  const t = tables[entity] as typeof products;
  const [row] = await db.insert(t).values(values as never).returning().catch(uniqueErr);
  const { passwordHash: _p, ...safe } = row as Record<string, unknown>;
  await audit(db, { userId: actor.id, action: `${entity}.create`, entity, entityId: String(safe.id), details: safe, ip });
  return safe;
}

export async function updateEntity(entity: Entity, id: string, body: unknown, actor: SessionUser, ip: string) {
  const parsed = (schemas[entity] as z.ZodObject).partial().parse(body) as Record<string, unknown>;
  const sent = new Set(Object.keys((body ?? {}) as object));
  const data = Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.has(k)));
  const t = tables[entity] as typeof products;
  const [before] = await db.select().from(t).where(eq(t.id, id));
  if (!before) throw notFound();
  let values: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (entity === "users") {
    const b = before as unknown as typeof users.$inferSelect;
    if (id === actor.id && (data.isActive === false || (data.role && data.role !== b.role))) {
      throw forbidden("Anda tidak dapat menonaktifkan atau mengubah role akun sendiri.");
    }
    const { password, ...rest } = values;
    const merged = { role: b.role, departmentId: b.departmentId, lineId: b.lineId, ...rest };
    values = { ...rest, ...(await validateUserAssignment(merged as never)) };
    if (password) values.passwordHash = await hashPassword(password as string);
    if (password || data.isActive === false || data.role) await db.delete(sessions).where(eq(sessions.userId, id));
  }
  const [row] = await db.update(t).set(values as never).where(eq(t.id, id)).returning().catch(uniqueErr);
  const strip = (o: Record<string, unknown>) => { const { passwordHash: _p, ...r } = o; return r; };
  await audit(db, {
    userId: actor.id, action: `${entity}.update`, entity, entityId: id, ip,
    details: { before: strip(before as never), after: strip(row as never), passwordChanged: !!data.password },
  });
  return strip(row as never);
}

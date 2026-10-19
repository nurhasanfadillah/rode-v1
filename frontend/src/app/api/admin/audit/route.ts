import { and, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { handler, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth";

const q = z.object({
  action: z.string().max(60).optional(), entity: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const GET = handler(async (req) => {
  await requireUser(["super_admin"]);
  const f = parseQuery(req, q);
  const where = and(...([f.action ? ilike(auditLogs.action, `%${f.action}%`) : undefined, f.entity ? eq(auditLogs.entity, f.entity) : undefined] as (SQL | undefined)[]));
  const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
  const items = await db.select({
    id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, details: auditLogs.details,
    ip: auditLogs.ip, createdAt: auditLogs.createdAt, userName: users.fullName, username: users.username,
  }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId)).where(where)
    .orderBy(desc(auditLogs.createdAt)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
  return { total, items, page: f.page, pageSize: f.pageSize };
});

import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, productionLines, productionTargets, users } from "@/db/schema";
import { ApiError, clientIp, handler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { todayJakarta } from "@/lib/time";
import { audit } from "@/services/settings";
import { loadTargetsUpTo, targetsOn } from "@/services/targets";

export const GET = handler(async () => {
  await requireUser(["super_admin", "manager"]);
  const today = todayJakarta();
  const t = targetsOn(await loadTargetsUpTo("9999-12-31"), today);
  const depts = await db.select().from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.sortOrder));
  const lines = await db.select().from(productionLines).where(eq(productionLines.isActive, true)).orderBy(asc(productionLines.sortOrder));
  const history = await db.select({
    id: productionTargets.id, departmentId: productionTargets.departmentId, lineId: productionTargets.lineId,
    effectiveFrom: productionTargets.effectiveFrom, dailyTarget: productionTargets.dailyTarget, blockTarget: productionTargets.blockTarget,
    createdAt: productionTargets.createdAt, createdByName: users.fullName,
  }).from(productionTargets).leftJoin(users, eq(users.id, productionTargets.createdBy))
    .orderBy(desc(productionTargets.createdAt)).limit(50);
  const upcoming = await loadTargetsUpTo("9999-12-31");
  return {
    today,
    rows: [
      ...depts.map((d) => ({ key: d.id, departmentId: d.id, lineId: null, label: d.name, kind: "department", current: t.dept(d.id) })),
      ...lines.map((l) => ({
        key: l.id, departmentId: l.departmentId, lineId: l.id, label: `${depts.find((d) => d.id === l.departmentId)?.name ?? ""} · ${l.name}`,
        kind: "line", current: t.line(l.departmentId, l.id),
      })),
    ],
    scheduled: upcoming.filter((u) => u.effectiveFrom > today),
    history,
  };
});

const schema = z.object({
  departmentId: z.string().uuid(), lineId: z.string().uuid().nullable().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyTarget: z.number().int().min(0).max(10_000_000).nullable(), blockTarget: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

export const POST = handler(async (req) => {
  const user = await requireUser(["super_admin"]);
  const b = await parseBody(req, schema);
  if (b.effectiveFrom < todayJakarta()) throw new ApiError(400, "Target hanya dapat berlaku mulai hari ini atau tanggal berikutnya agar laporan historis tidak berubah.");
  const [row] = await db.insert(productionTargets).values({ ...b, lineId: b.lineId ?? null, blockTarget: b.blockTarget ?? null, createdBy: user.id }).returning();
  await audit(db, { userId: user.id, action: "target.create", entity: "production_targets", entityId: row.id, details: b, ip: clientIp(req) });
  return row;
});

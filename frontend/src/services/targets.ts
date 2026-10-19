import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { productionTargets } from "@/db/schema";

export interface TargetRow { departmentId: string; lineId: string | null; dailyTarget: number | null; blockTarget: number | null; effectiveFrom: string }

export async function loadTargetsUpTo(date: string) {
  return db.select().from(productionTargets).where(lte(productionTargets.effectiveFrom, date))
    .orderBy(desc(productionTargets.effectiveFrom), desc(productionTargets.createdAt));
}

/** Latest target per (department, line) effective on `date`. */
export function targetsOn(rows: TargetRow[], date: string) {
  const map = new Map<string, TargetRow>();
  for (const r of rows) {
    if (r.effectiveFrom > date) continue;
    const k = `${r.departmentId}:${r.lineId ?? ""}`;
    if (!map.has(k)) map.set(k, r);
  }
  return {
    line: (deptId: string, lineId: string) => map.get(`${deptId}:${lineId}`) ?? null,
    dept: (deptId: string) => map.get(`${deptId}:`) ?? null,
  };
}

export async function currentTargetHistory(departmentId: string, lineId: string | null) {
  return db.select().from(productionTargets)
    .where(and(eq(productionTargets.departmentId, departmentId), lineId ? eq(productionTargets.lineId, lineId) : undefined))
    .orderBy(desc(productionTargets.effectiveFrom), desc(productionTargets.createdAt)).limit(20);
}

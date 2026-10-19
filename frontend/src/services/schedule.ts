import { and, asc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { productionTransactions, shiftBreaks, shifts, shiftVersions } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { buildDayPlan, parseHM, pickVersion, resolveWorkContext, todayJakarta, type ScheduleConfig } from "@/lib/time";
import { audit } from "./settings";

export interface ScheduleData {
  shifts: { id: string; code: string; name: string; isActive: boolean; sortOrder: number }[];
  versions: (ScheduleConfig & { note: string | null; createdAt: Date })[];
}

export async function loadSchedule(): Promise<ScheduleData> {
  const s = await db.select().from(shifts).orderBy(asc(shifts.sortOrder), asc(shifts.code));
  const v = await db.select().from(shiftVersions);
  const b = await db.select().from(shiftBreaks);
  const versions = v.map((x) => ({
    shiftId: x.shiftId,
    shiftVersionId: x.id,
    shiftName: s.find((sh) => sh.id === x.shiftId)?.name ?? "",
    effectiveFrom: x.effectiveFrom,
    startTime: x.startTime,
    endTime: x.endTime,
    blockMinutes: x.blockMinutes,
    workDays: x.workDays,
    breakMode: x.breakMode,
    outsidePolicy: x.outsidePolicy,
    breaks: b.filter((br) => br.shiftVersionId === x.id).map((br) => ({ startTime: br.startTime, endTime: br.endTime, label: br.label }))
      .sort((p, q) => (p.startTime < q.startTime ? -1 : 1)),
    note: x.note,
    createdAt: x.createdAt,
  }));
  return { shifts: s.map(({ createdAt: _c, ...rest }) => rest), versions };
}

export function configsFor(data: ScheduleData, date: string, shiftId?: string): ScheduleConfig[] {
  return data.shifts
    .filter((s) => s.isActive && (!shiftId || s.id === shiftId))
    .map((s) => pickVersion(data.versions.filter((v) => v.shiftId === s.id), date))
    .filter((v): v is NonNullable<typeof v> => !!v);
}

export async function currentContext(now = new Date()) {
  const data = await loadSchedule();
  return resolveWorkContext(now, (d) => configsFor(data, d));
}

const hm = z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM");
export const versionSchema = z.object({
  shiftId: z.string().uuid(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: hm,
  endTime: hm,
  blockMinutes: z.number().int().min(5).max(480),
  workDays: z.array(z.number().int().min(1).max(7)).min(1),
  breakMode: z.enum(["exclude", "clock"]),
  outsidePolicy: z.enum(["reject", "clamp"]),
  breaks: z.array(z.object({ startTime: hm, endTime: hm, label: z.string().min(1).max(40) })).max(10),
  note: z.string().max(300).optional().nullable(),
});

export async function createVersion(input: z.infer<typeof versionSchema>, userId: string, ip: string) {
  const today = todayJakarta();
  if (input.effectiveFrom < today) throw new ApiError(400, "Tanggal berlaku tidak boleh di masa lalu agar data historis tidak berubah.");
  parseHM(input.startTime); parseHM(input.endTime);
  const plan = buildDayPlan({ ...input, shiftVersionId: "", shiftName: "", breaks: input.breaks });
  if (plan.blocks.length === 0) throw new ApiError(400, "Konfigurasi tidak menghasilkan blok produktif.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(productionTransactions)
    .where(and(eq(productionTransactions.shiftId, input.shiftId), gte(productionTransactions.workDate, input.effectiveFrom)));
  if (n > 0) throw new ApiError(409, "Sudah ada transaksi pada/after tanggal tersebut untuk shift ini. Pilih tanggal berlaku berikutnya.");

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(shiftVersions)
      .where(and(eq(shiftVersions.shiftId, input.shiftId), eq(shiftVersions.effectiveFrom, input.effectiveFrom)));
    if (existing[0]) {
      await tx.delete(shiftBreaks).where(eq(shiftBreaks.shiftVersionId, existing[0].id));
      await tx.delete(shiftVersions).where(eq(shiftVersions.id, existing[0].id));
    }
    const [v] = await tx.insert(shiftVersions).values({
      shiftId: input.shiftId, effectiveFrom: input.effectiveFrom, startTime: input.startTime, endTime: input.endTime,
      blockMinutes: input.blockMinutes, workDays: input.workDays, breakMode: input.breakMode,
      outsidePolicy: input.outsidePolicy, note: input.note ?? null, createdBy: userId,
    }).returning();
    if (input.breaks.length) await tx.insert(shiftBreaks).values(input.breaks.map((b) => ({ ...b, shiftVersionId: v.id })));
    await audit(tx, { userId, action: "schedule.version_create", entity: "shift_versions", entityId: v.id, details: { ...input, replaced: existing[0]?.id ?? null }, ip });
    return v;
  });
}

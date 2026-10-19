import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, productionLines, products, productionTransactions as T } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { pct } from "@/lib/format";
import {
  addDays, blockAt, blockState, blockTargetFor, buildDayPlan, daysBetween, formatHM, isWorkDay, jakartaInstant,
  lineActivity, minutesOnWorkDate, todayJakarta, type Activity, type BlockState,
} from "@/lib/time";
import { configsFor, loadSchedule } from "./schedule";
import { getSettings } from "./settings";
import { loadTargetsUpTo, targetsOn } from "./targets";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const dashFilterSchema = z.object({
  from: dateStr.optional(), to: dateStr.optional(), date: dateStr.optional(),
  departmentId: z.string().uuid().optional(), lineId: z.string().uuid().optional(), shiftId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(), operatorId: z.string().uuid().optional(),
});
export type DashFilters = z.infer<typeof dashFilterSchema>;

const sumQty = sql<number>`coalesce(sum(${T.quantity}), 0)::int`;
const hourExpr = sql<number>`extract(hour from (${T.recordedAt} at time zone 'UTC') + interval '7 hours')::int`;

export interface LineBlock { no: number; start: string; end: string; qty: number; target: number | null; state: BlockState; current: boolean; breakOnly: boolean }

export async function getDashboard(input: DashFilters, now = new Date()) {
  const today = todayJakarta(now);
  const to = input.to ?? input.date ?? today;
  const from = input.from ?? input.date ?? to;
  if (from > to) throw new ApiError(400, "Tanggal awal harus sebelum tanggal akhir.");
  if (daysBetween(from, to) > 92) throw new ApiError(400, "Rentang tanggal maksimal 93 hari.");
  const singleDay = from === to;
  const [settings, schedule, targetRows] = [await getSettings(), await loadSchedule(), await loadTargetsUpTo(to)];

  const depts = await db.select().from(departments)
    .where(and(eq(departments.isActive, true), input.departmentId ? eq(departments.id, input.departmentId) : undefined))
    .orderBy(asc(departments.sortOrder));
  const lineRows = await db.select().from(productionLines)
    .where(and(eq(productionLines.isActive, true), input.lineId ? eq(productionLines.id, input.lineId) : undefined,
      input.departmentId ? eq(productionLines.departmentId, input.departmentId) : undefined))
    .orderBy(asc(productionLines.sortOrder), asc(productionLines.code));

  const where = and(...([
    gte(T.workDate, from), lte(T.workDate, to), ne(T.status, "cancelled"),
    input.departmentId ? eq(T.departmentId, input.departmentId) : undefined, input.lineId ? eq(T.lineId, input.lineId) : undefined,
    input.shiftId ? eq(T.shiftId, input.shiftId) : undefined, input.productId ? eq(T.productId, input.productId) : undefined,
    input.operatorId ? eq(T.operatorId, input.operatorId) : undefined,
  ] as (SQL | undefined)[]));

  const byDeptProduct = await db.select({ departmentId: T.departmentId, productId: T.productId, qty: sumQty, n: sql<number>`count(*)::int` })
    .from(T).where(where).groupBy(T.departmentId, T.productId);
  const byLineBlock = await db.select({ lineId: T.lineId, blockNo: T.blockNo, productId: T.productId, qty: sumQty })
    .from(T).where(and(where, isNotNull(T.lineId))).groupBy(T.lineId, T.blockNo, T.productId);
  const byHour = await db.select({ hour: hourExpr, departmentId: T.departmentId, qty: sumQty })
    .from(T).where(and(where, isNotNull(T.lineId))).groupBy(hourExpr, T.departmentId);
  const byDay = await db.select({ workDate: T.workDate, departmentId: T.departmentId, qty: sumQty })
    .from(T).where(where).groupBy(T.workDate, T.departmentId);
  const [{ last }] = await db.select({ last: sql<string | null>`max(${T.updatedAt})` }).from(T)
    .where(and(gte(T.workDate, from), lte(T.workDate, to)));
  const lastPerLine = await db.selectDistinctOn([T.lineId], { lineId: T.lineId, productId: T.productId, recordedAt: T.recordedAt })
    .from(T).where(and(eq(T.workDate, to), ne(T.status, "cancelled"), isNotNull(T.lineId)))
    .orderBy(T.lineId, desc(T.recordedAt));

  const productIds = [...new Set(byDeptProduct.map((r) => r.productId).concat(lastPerLine.map((r) => r.productId)))];
  const productRows = productIds.length ? await db.select({ id: products.id, code: products.code, name: products.name, unit: products.unit, isDemo: products.isDemo })
    .from(products).where(inArray(products.id, productIds)) : [];
  const pName = new Map(productRows.map((p) => [p.id, p]));

  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const cfgOn = (d: string) => configsFor(schedule, d, input.shiftId)[0] ?? null;
  const workDays = dates.filter((d) => { const c = cfgOn(d); return c && isWorkDay(c, d); });

  const cfg = cfgOn(to);
  const plan = cfg ? buildDayPlan(cfg) : null;
  const nowPos = cfg && to === today ? blockAt(cfg, minutesOnWorkDate(to, now), plan!) : null;

  const lineTargetOn = (deptId: string, lineId: string, d: string) => targetsOn(targetRows, d).line(deptId, lineId);
  const lines = lineRows.filter((l) => depts.some((d) => d.id === l.departmentId)).map((l) => {
    const rows = byLineBlock.filter((r) => r.lineId === l.id);
    const actual = rows.reduce((s, r) => s + r.qty, 0);
    const target = workDays.reduce((s, d) => s + (lineTargetOn(l.departmentId, l.id, d)?.dailyTarget ?? 0), 0) || null;
    const tToday = lineTargetOn(l.departmentId, l.id, to);
    const prodBlocks = plan ? plan.blocks.filter((b) => !b.breakOnly).length : 0;
    const blockTarget = tToday?.blockTarget ?? (tToday?.dailyTarget && prodBlocks ? Math.ceil(tToday.dailyTarget / prodBlocks) : null);
    const qtyBlock = (no: number) => rows.filter((r) => r.blockNo === no).reduce((s, r) => s + r.qty, 0);
    const blocks: LineBlock[] = singleDay && plan && cfg ? plan.blocks.map((b) => {
      const started = to < today || (to === today && now >= jakartaInstant(to, b.start));
      const t = blockTargetFor(b, blockTarget, cfg.blockMinutes);
      const qty = qtyBlock(b.no);
      return {
        no: b.no, start: formatHM(b.start), end: formatHM(b.end), qty, target: t, breakOnly: b.breakOnly,
        state: b.breakOnly && qty === 0 ? "upcoming" : blockState(qty, t, started), current: nowPos?.blockNo === b.no,
      };
    }) : [];
    const lp = lastPerLine.find((r) => r.lineId === l.id);
    const withData = blocks.filter((b) => b.qty > 0);
    const lastBlock = nowPos ? blocks.find((b) => b.no === nowPos.blockNo) : withData[withData.length - 1];
    const activity: Activity | null = to === today
      ? lineActivity({ cfg, workDate: to, now, lastInputAt: lp?.recordedAt ?? null, idleThresholdMin: settings.idleThresholdMin })
      : null;
    const prodMap = new Map<string, number>();
    rows.forEach((r) => prodMap.set(r.productId, (prodMap.get(r.productId) ?? 0) + r.qty));
    return {
      id: l.id, code: l.code, name: l.name, departmentId: l.departmentId, actual, target, pct: pct(actual, target), blockTarget,
      blocks, lastBlock: lastBlock ? { no: lastBlock.no, qty: lastBlock.qty } : null, activity,
      currentProduct: lp ? pName.get(lp.productId)?.name ?? null : null, lastInputAt: lp?.recordedAt ?? null,
      products: [...prodMap].map(([id, qty]) => ({ id, name: pName.get(id)?.name ?? "-", qty })).sort((a, b) => b.qty - a.qty),
    };
  });

  const deptStats = depts.map((d) => {
    const actual = byDeptProduct.filter((r) => r.departmentId === d.id).reduce((s, r) => s + r.qty, 0);
    const target = workDays.reduce((s, day) => {
      const t = targetsOn(targetRows, day);
      const explicit = t.dept(d.id)?.dailyTarget;
      if (explicit != null) return s + explicit;
      return s + lineRows.filter((l) => l.departmentId === d.id).reduce((x, l) => x + (t.line(d.id, l.id)?.dailyTarget ?? 0), 0);
    }, 0) || null;
    const top = byDeptProduct.filter((r) => r.departmentId === d.id).sort((a, b) => b.qty - a.qty)[0];
    return {
      id: d.id, code: d.code, name: d.name, kind: d.kind, actual, target, pct: pct(actual, target),
      topProduct: top ? { name: pName.get(top.productId)?.name ?? "-", qty: top.qty } : null,
    };
  });

  const metricDept = deptStats.find((d) => d.code === settings.targetMetricDepartmentCode) ?? deptStats[deptStats.length - 1] ?? null;
  const topRow = [...byDeptProduct].sort((a, b) => b.qty - a.qty)[0];
  const productTable = productIds.filter((id) => byDeptProduct.some((r) => r.productId === id)).map((id) => {
    const per: Record<string, number> = {};
    byDeptProduct.filter((r) => r.productId === id).forEach((r) => { per[r.departmentId] = r.qty; });
    const p = pName.get(id);
    return { id, code: p?.code ?? "", name: p?.name ?? "-", unit: p?.unit ?? "PCS", isDemo: p?.isDemo ?? false, byDept: per };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const hours = new Set(byHour.map((h) => h.hour));
  if (plan) for (let m = plan.start; m < plan.end; m += 60) hours.add(Math.floor((m % 1440) / 60));
  const hourly = [...hours].sort((a, b) => a - b).map((h) => {
    const row: Record<string, number | string> = { hour: `${String(h).padStart(2, "0")}.00` };
    depts.forEach((d) => { row[d.code] = byHour.filter((x) => x.hour === h && x.departmentId === d.id).reduce((s, x) => s + x.qty, 0); });
    return row;
  });
  const daily = dates.map((d) => {
    const row: Record<string, number | string> = { date: d };
    depts.forEach((dp) => { row[dp.code] = byDay.find((x) => x.workDate === d && x.departmentId === dp.id)?.qty ?? 0; });
    return row;
  });
  const sewingLines = lines.filter((l) => l.blocks.length);
  const blockSeries = plan && singleDay ? plan.blocks.map((b) => {
    const row: Record<string, number | string> = { block: `B${b.no}`, time: formatHM(b.start) };
    sewingLines.forEach((l) => { row[l.code] = l.blocks.find((x) => x.no === b.no)?.qty ?? 0; });
    return row;
  }) : [];

  const opStatus = to !== today ? "history" : !cfg || !isWorkDay(cfg, to) ? "off"
    : !plan ? "off" : (() => {
      const m = minutesOnWorkDate(to, now);
      if (m < plan.start) return "before";
      if (m >= plan.end) return "done";
      return nowPos?.inBreak ? "break" : "running";
    })();

  return {
    filters: { ...input, from, to }, serverTime: now.toISOString(), lastUpdated: last ? new Date(last).toISOString() : null,
    settings: { refreshSec: settings.dashboardRefreshSec, displayRefreshSec: settings.displayRefreshSec, idleThresholdMin: settings.idleThresholdMin },
    departments: deptStats,
    metric: metricDept ? { code: metricDept.code, name: metricDept.name, actual: metricDept.actual, target: metricDept.target, pct: metricDept.pct } : null,
    topProduct: topRow ? { name: pName.get(topRow.productId)?.name ?? "-", qty: topRow.qty, departmentName: depts.find((d) => d.id === topRow.departmentId)?.name ?? "" } : null,
    lines, linesTotal: lines.length, linesProducing: lines.filter((l) => l.actual > 0).length,
    idleLines: lines.filter((l) => l.activity === "idle").map((l) => ({ id: l.id, name: l.name, lastInputAt: l.lastInputAt })),
    products: productTable, hourly, daily, blockSeries,
    schedule: cfg && plan ? {
      shiftName: cfg.shiftName, blockMinutes: cfg.blockMinutes, start: formatHM(plan.start), end: formatHM(plan.end),
      breaks: plan.breaks.map((b) => ({ start: formatHM(b.start), end: formatHM(b.end), label: b.label })),
      isWorkDay: isWorkDay(cfg, to), currentBlock: nowPos?.blockNo ?? null, status: opStatus,
    } : { status: opStatus },
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

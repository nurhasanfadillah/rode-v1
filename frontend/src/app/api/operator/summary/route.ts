import { z } from "zod";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ApiError, forbidden, handler, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { todayJakarta } from "@/lib/time";
import { getDashboard } from "@/services/aggregate";
import { currentContext } from "@/services/schedule";
import { recentOwn } from "@/services/transactions";

const q = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  departmentId: z.string().uuid().optional(), lineId: z.string().uuid().optional(),
});

export const GET = handler(async (req) => {
  const user = await requireUser(["operator", "super_admin"]);
  const f = parseQuery(req, q);
  const departmentId = user.role === "operator" ? user.departmentId : f.departmentId;
  if (!departmentId) throw forbidden("Akun belum ditugaskan ke departemen.");
  const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
  if (!dept) throw new ApiError(404, "Departemen tidak ditemukan.");
  const ctx = await currentContext();
  const isLine = dept.kind === "line_block";
  const lineId = isLine ? (user.role === "operator" ? user.lineId : f.lineId) : undefined;
  if (isLine && !lineId) throw forbidden("Pilih / tugaskan line terlebih dahulu.");
  const date = isLine ? (ctx.ok ? ctx.workDate : todayJakarta()) : f.date ?? todayJakarta();
  const dash = await getDashboard({ date, departmentId, lineId: lineId ?? undefined });
  return {
    department: { id: dept.id, name: dept.name, kind: dept.kind },
    context: { ok: ctx.ok, workDate: ctx.workDate, blockNo: ctx.blockNo, inBreak: ctx.inBreak, outside: ctx.outside, reason: ctx.reason ?? null, shiftName: ctx.config?.shiftName ?? null },
    date, serverTime: dash.serverTime, lastUpdated: dash.lastUpdated,
    line: isLine ? dash.lines[0] ?? null : null,
    departmentTotal: dash.departments[0] ?? null,
    products: dash.products.map((p) => ({ id: p.id, name: p.name, code: p.code, qty: p.byDept[departmentId] ?? 0 })).sort((a, b) => b.qty - a.qty),
    schedule: dash.schedule,
    mine: await recentOwn(user.id, date),
  };
});

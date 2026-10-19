import { z } from "zod";
import { db } from "@/db";
import { clientIp, handler, parseQuery } from "@/lib/api";
import { rateLimit, requireUser } from "@/lib/auth";
import { dashFilterSchema } from "@/services/aggregate";
import { buildReport, toCsv, toXlsx } from "@/services/report";
import { audit } from "@/services/settings";

export const runtime = "nodejs";
const schema = dashFilterSchema.extend({ format: z.enum(["csv", "xlsx"]) });

export const GET = handler(async (req) => {
  const user = await requireUser(["manager", "super_admin"]);
  rateLimit(`export:${user.id}`, 30, 60_000);
  const { format, ...f } = parseQuery(req, schema);
  const report = await buildReport(f);
  const period = report.meta.find(([k]) => k === "Periode")?.[1] ?? "";
  const range = f.from && f.to && f.from !== f.to ? `${f.from}_${f.to}` : f.date ?? f.to ?? f.from ?? "hari-ini";
  const name = `RODE_Laporan_${range}.${format}`;
  await audit(db, { userId: user.id, action: "report.export", entity: "reports", details: { format, filters: f, period }, ip: clientIp(req) });
  const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" };
  if (format === "csv") return new Response(toCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  const buf = await toXlsx(report);
  return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
});

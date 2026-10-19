import { handler } from "@/lib/api";
import { rateLimit } from "@/lib/auth";
import { clientIp } from "@/lib/api";
import { getDashboard } from "@/services/aggregate";
import { displayFromToken } from "@/services/display";

export const GET = handler(async (req) => {
  rateLimit(`display:${clientIp(req)}`, 120, 60_000);
  const token = req.headers.get("x-display-token") ?? req.nextUrl.searchParams.get("token");
  const d = await displayFromToken(token);
  const dash = await getDashboard({ lineId: d.mode === "line" && d.lineId ? d.lineId : undefined });
  return {
    display: { name: d.name, mode: d.mode, rotateSeconds: d.rotateSeconds, lineId: d.lineId },
    serverTime: dash.serverTime, lastUpdated: dash.lastUpdated, refreshSec: dash.settings.displayRefreshSec,
    departments: dash.departments, metric: dash.metric, topProduct: dash.topProduct, schedule: dash.schedule,
    lines: dash.lines.map(({ lastInputAt: _l, ...l }) => l), hourly: dash.hourly, blockSeries: dash.blockSeries,
    products: dash.products, linesProducing: dash.linesProducing, linesTotal: dash.linesTotal,
  };
});

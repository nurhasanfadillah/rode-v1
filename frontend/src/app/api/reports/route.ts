import { handler, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { dashFilterSchema } from "@/services/aggregate";
import { buildReport } from "@/services/report";

export const GET = handler(async (req) => {
  await requireUser(["manager", "super_admin"]);
  return buildReport(parseQuery(req, dashFilterSchema));
});

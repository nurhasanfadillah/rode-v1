import { handler, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { dashFilterSchema, getDashboard } from "@/services/aggregate";

export const GET = handler(async (req) => {
  await requireUser(["manager", "super_admin"]);
  return getDashboard(parseQuery(req, dashFilterSchema));
});

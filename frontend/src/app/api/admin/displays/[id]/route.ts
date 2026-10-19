import { clientIp, handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { updateDisplay } from "@/services/display";

export const PATCH = handler(async (req, ctx) => {
  const user = await requireUser(["super_admin"]);
  const { id } = await ctx.params;
  return updateDisplay(id, await req.json().catch(() => ({})), user.id, clientIp(req));
});

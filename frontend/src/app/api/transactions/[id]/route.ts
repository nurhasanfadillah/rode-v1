import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getTransaction } from "@/services/transactions";

export const GET = handler(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return getTransaction(user, id);
});

import { z } from "zod";
import { handler, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getTransaction } from "@/services/transactions";

export const GET = handler(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw notFound("Transaksi tidak ditemukan.");
  return getTransaction(user, id);
});

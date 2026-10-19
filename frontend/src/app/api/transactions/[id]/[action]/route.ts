import { z } from "zod";
import { ApiError, clientIp, handler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { amendTransaction, cancelSchema, correctSchema } from "@/services/transactions";

export const POST = handler(async (req, ctx) => {
  const user = await requireUser();
  const { id, action } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "Transaksi tidak ditemukan.");
  if (action === "correct") {
    const body = await parseBody(req, correctSchema);
    return { transaction: await amendTransaction(user, id, "correct", body, clientIp(req)) };
  }
  if (action === "cancel") {
    const body = await parseBody(req, cancelSchema);
    return { transaction: await amendTransaction(user, id, "cancel", body, clientIp(req)) };
  }
  throw new ApiError(404, "Aksi tidak dikenal.");
});

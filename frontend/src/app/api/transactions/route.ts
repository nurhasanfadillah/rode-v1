import { handler, parseBody, parseQuery } from "@/lib/api";
import { rateLimit, requireUser } from "@/lib/auth";
import { createTransaction, createTxSchema, listSchema, listTransactions } from "@/services/transactions";

export const GET = handler(async (req) => {
  const user = await requireUser();
  return listTransactions(user, parseQuery(req, listSchema));
});

export const POST = handler(async (req) => {
  const user = await requireUser(["operator", "super_admin"]);
  rateLimit(`tx:${user.id}`, 240, 60_000);
  const input = await parseBody(req, createTxSchema);
  const r = await createTransaction(user, input);
  return Response.json({ ...r, serverTime: new Date().toISOString() }, { status: r.duplicate ? 200 : 201 });
});

import { db } from "@/db";
import { clientIp, handler } from "@/lib/api";
import { destroySession, getSessionUser } from "@/lib/auth";
import { audit } from "@/services/settings";

export const POST = handler(async (req) => {
  const u = await getSessionUser();
  await destroySession();
  if (u) await audit(db, { userId: u.id, action: "auth.logout", entity: "users", entityId: u.id, ip: clientIp(req) });
  return { ok: true };
});

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, clientIp, handler, parseBody } from "@/lib/api";
import { checkLockout, clearFailures, createSession, rateLimit, recordFailure, verifyPassword } from "@/lib/auth";
import { audit } from "@/services/settings";

const schema = z.object({ username: z.string().trim().toLowerCase().min(1).max(60), password: z.string().min(1).max(200) });

export const POST = handler(async (req) => {
  const ip = clientIp(req);
  rateLimit(`login:${ip}`, 20, 60_000);
  const { username, password } = await parseBody(req, schema);
  const id = `user:${username}`;
  await checkLockout(id);
  const [u] = await db.select().from(users).where(eq(users.username, username));
  const ok = u && u.isActive && (await verifyPassword(password, u.passwordHash));
  if (!ok) {
    await recordFailure(id);
    await audit(db, { userId: u?.id ?? null, action: "auth.login_failed", entity: "users", entityId: u?.id ?? null, details: { username }, ip });
    throw new ApiError(401, "Username atau password salah, atau akun tidak aktif.", "INVALID_CREDENTIALS");
  }
  await clearFailures(id);
  await createSession(u.id, ip);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await audit(db, { userId: u.id, action: "auth.login", entity: "users", entityId: u.id, ip });
  return { user: { id: u.id, fullName: u.fullName, username: u.username, role: u.role, departmentId: u.departmentId, lineId: u.lineId } };
});

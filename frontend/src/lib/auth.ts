import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { loginAttempts, sessions, users, type Role } from "@/db/schema";
import { ApiError } from "./api";

export const SESSION_COOKIE = "rode_session";
const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 12);
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export interface SessionUser {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  departmentId: string | null;
  lineId: string | null;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function requireRole(user: SessionUser | null, roles?: Role[]): SessionUser {
  if (!user) throw new ApiError(401, "Sesi berakhir. Silakan login kembali.", "UNAUTHENTICATED");
  if (roles && !roles.includes(user.role)) throw new ApiError(403, "Anda tidak memiliki akses untuk fitur ini.", "FORBIDDEN");
  return user;
}

export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id, fullName: users.fullName, username: users.username, role: users.role,
      departmentId: users.departmentId, lineId: users.lineId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()), eq(users.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  return requireRole(await getSessionUser(), roles);
}

export async function createSession(userId: string, ip: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt, ip });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_INSECURE !== "true",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function checkLockout(identifier: string) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.identifier, identifier));
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    const mins = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(429, `Terlalu banyak percobaan gagal. Coba lagi dalam ${mins} menit.`, "LOCKED");
  }
}

export async function recordFailure(identifier: string) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.identifier, identifier));
  const failures = (row?.lockedUntil && row.lockedUntil <= new Date() ? 0 : row?.failures ?? 0) + 1;
  const lockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
  await db.insert(loginAttempts).values({ identifier, failures, lockedUntil, updatedAt: new Date() })
    .onConflictDoUpdate({ target: loginAttempts.identifier, set: { failures, lockedUntil, updatedAt: new Date() } });
}

export async function clearFailures(identifier: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.identifier, identifier));
}

const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return; }
  b.count += 1;
  if (b.count > limit) throw new ApiError(429, "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.", "RATE_LIMIT");
}

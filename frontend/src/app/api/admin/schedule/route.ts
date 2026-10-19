import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { ApiError, clientIp, handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createVersion, loadSchedule, versionSchema } from "@/services/schedule";
import { audit } from "@/services/settings";

export const GET = handler(async () => {
  await requireUser(["super_admin"]);
  const data = await loadSchedule();
  return {
    shifts: data.shifts,
    versions: data.versions.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)),
  };
});

const shiftSchema = z.object({ code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()), name: z.string().trim().min(1).max(60) });
const toggleSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export const POST = handler(async (req) => {
  const user = await requireUser(["super_admin"]);
  const ip = clientIp(req);
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "create_version") return createVersion(versionSchema.parse(body), user.id, ip);
  if (body.action === "create_shift") {
    const s = shiftSchema.parse(body);
    const n = (await db.select({ id: shifts.id }).from(shifts)).length;
    const [row] = await db.insert(shifts).values({ ...s, sortOrder: n + 1 }).onConflictDoNothing().returning();
    if (!row) throw new ApiError(409, "Kode shift sudah digunakan.");
    await audit(db, { userId: user.id, action: "schedule.shift_create", entity: "shifts", entityId: row.id, details: s, ip });
    return row;
  }
  if (body.action === "toggle_shift") {
    const t = toggleSchema.parse(body);
    const [row] = await db.update(shifts).set({ isActive: t.isActive }).where(eq(shifts.id, t.id)).returning();
    await audit(db, { userId: user.id, action: "schedule.shift_toggle", entity: "shifts", entityId: t.id, details: t, ip });
    return row;
  }
  throw new ApiError(400, "Aksi tidak dikenal.");
});

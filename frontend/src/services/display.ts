import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { displaySettings, productionLines } from "@/db/schema";
import { ApiError, notFound } from "@/lib/api";
import { sha256 } from "@/lib/auth";
import { audit } from "./settings";

export const displaySchema = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(["all", "sewing", "print_pack", "line", "rotate"]),
  lineId: z.string().uuid().optional().nullable(),
  rotateSeconds: z.number().int().min(5).max(600).default(20),
});

export async function listDisplays() {
  return db.select({
    id: displaySettings.id, name: displaySettings.name, tokenPrefix: displaySettings.tokenPrefix, mode: displaySettings.mode,
    lineId: displaySettings.lineId, rotateSeconds: displaySettings.rotateSeconds, isActive: displaySettings.isActive,
    lastSeenAt: displaySettings.lastSeenAt, createdAt: displaySettings.createdAt, revokedAt: displaySettings.revokedAt,
    lineName: productionLines.name,
  }).from(displaySettings).leftJoin(productionLines, eq(productionLines.id, displaySettings.lineId)).orderBy(desc(displaySettings.createdAt));
}

export async function createDisplay(input: z.infer<typeof displaySchema>, userId: string, ip: string) {
  if (input.mode === "line" && !input.lineId) throw new ApiError(400, "Pilih line untuk mode satu line.");
  const token = `rdtv_${randomBytes(24).toString("base64url")}`;
  const [row] = await db.insert(displaySettings).values({
    ...input, lineId: input.mode === "line" ? input.lineId : null, tokenHash: sha256(token), tokenPrefix: token.slice(0, 10), createdBy: userId,
  }).returning({ id: displaySettings.id });
  await audit(db, { userId, action: "display.create", entity: "display_settings", entityId: row.id, details: { ...input }, ip });
  return { id: row.id, token };
}

export async function updateDisplay(id: string, body: unknown, userId: string, ip: string) {
  const data = displaySchema.partial().extend({ isActive: z.boolean().optional() }).parse(body);
  const [row] = await db.update(displaySettings).set({
    ...data, ...(data.isActive === false ? { revokedAt: new Date() } : data.isActive === true ? { revokedAt: null } : {}),
  }).where(eq(displaySettings.id, id)).returning({ id: displaySettings.id });
  if (!row) throw notFound();
  await audit(db, { userId, action: data.isActive === false ? "display.revoke" : "display.update", entity: "display_settings", entityId: id, details: data, ip });
  return row;
}

export async function displayFromToken(token: string | null) {
  if (!token) throw new ApiError(401, "Token display diperlukan.", "DISPLAY_TOKEN");
  const [row] = await db.select().from(displaySettings).where(eq(displaySettings.tokenHash, sha256(token)));
  if (!row || !row.isActive) throw new ApiError(401, "Token display tidak valid atau sudah dicabut.", "DISPLAY_TOKEN");
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > 60_000) {
    await db.update(displaySettings).set({ lastSeenAt: new Date() }).where(eq(displaySettings.id, row.id));
  }
  return row;
}

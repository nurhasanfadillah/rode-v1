import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { appSettings, auditLogs } from "@/db/schema";

export const settingsSchema = z.object({
  allowBulkInput: z.boolean(),
  operatorCorrectionEnabled: z.boolean(),
  operatorCorrectionWindowMin: z.number().int().min(1).max(1440),
  managerCanCorrect: z.boolean(),
  dashboardRefreshSec: z.number().int().min(5).max(300),
  displayRefreshSec: z.number().int().min(5).max(300),
  idleThresholdMin: z.number().int().min(1).max(240),
  targetMetricDepartmentCode: z.string().min(1),
  allowBackdateDays: z.number().int().min(0).max(31),
});
export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  allowBulkInput: true,
  operatorCorrectionEnabled: true,
  operatorCorrectionWindowMin: 15,
  managerCanCorrect: true,
  dashboardRefreshSec: 10,
  displayRefreshSec: 10,
  idleThresholdMin: 15,
  targetMetricDepartmentCode: "PACKING",
  allowBackdateDays: 3,
};

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "general"));
  return { ...DEFAULT_SETTINGS, ...((row?.value ?? {}) as Partial<AppSettings>) };
}

export async function updateSettings(next: AppSettings, userId: string, ip: string) {
  const before = await getSettings();
  await db.transaction(async (tx) => {
    await tx.insert(appSettings).values({ key: "general", value: next, updatedBy: userId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: userId, updatedAt: new Date() } });
    await audit(tx, { userId, action: "settings.update", entity: "app_settings", entityId: "general", details: { before, after: next }, ip });
  });
  return next;
}

export async function audit(
  tx: Tx | typeof db,
  e: { userId: string | null; action: string; entity: string; entityId?: string | null; details?: Record<string, unknown>; ip?: string | null },
) {
  await tx.insert(auditLogs).values({
    userId: e.userId, action: e.action, entity: e.entity, entityId: e.entityId ?? null, details: e.details ?? null, ip: e.ip ?? null,
  });
}

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, productionLines, products, users } from "@/db/schema";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { todayJakarta } from "@/lib/time";
import { loadSchedule } from "@/services/schedule";
import { getSettings } from "@/services/settings";

export const GET = handler(async () => {
  const user = await requireUser();
  const [depts, lines, prods, settings, schedule] = [
    await db.select().from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.sortOrder)),
    await db.select().from(productionLines).where(eq(productionLines.isActive, true)).orderBy(asc(productionLines.sortOrder)),
    await db.select({ id: products.id, code: products.code, name: products.name, unit: products.unit, category: products.category, isDemo: products.isDemo })
      .from(products).where(eq(products.isActive, true)).orderBy(asc(products.name)),
    await getSettings(),
    await loadSchedule(),
  ];
  const operators = user.role === "operator" ? [] : await db.select({ id: users.id, fullName: users.fullName })
    .from(users).where(eq(users.role, "operator")).orderBy(asc(users.fullName));
  return {
    user, today: todayJakarta(), serverTime: new Date().toISOString(),
    departments: depts, lines, products: prods, operators,
    shifts: schedule.shifts.filter((s) => s.isActive),
    settings: {
      allowBulkInput: settings.allowBulkInput, allowBackdateDays: settings.allowBackdateDays,
      dashboardRefreshSec: settings.dashboardRefreshSec, operatorCorrectionEnabled: settings.operatorCorrectionEnabled,
      operatorCorrectionWindowMin: settings.operatorCorrectionWindowMin,
    },
  };
});

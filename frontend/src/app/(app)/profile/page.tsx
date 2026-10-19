import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, productionLines } from "@/db/schema";
import { ProfileView } from "@/components/ProfileView";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  const user = await requirePage();
  const dept = user.departmentId ? (await db.select().from(departments).where(eq(departments.id, user.departmentId)))[0] : null;
  const line = user.lineId ? (await db.select().from(productionLines).where(eq(productionLines.id, user.lineId)))[0] : null;
  return <ProfileView user={user} department={dept?.name ?? null} line={line?.name ?? null} />;
}

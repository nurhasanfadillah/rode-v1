import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { requirePage } from "@/lib/page-guard";
import { todayJakarta } from "@/lib/time";

export default async function Page() {
  await requirePage(["manager", "super_admin"]);
  return <DashboardPage initialDate={todayJakarta()} />;
}

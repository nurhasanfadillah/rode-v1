import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  await requirePage(["manager", "super_admin"]);
  return <DashboardPage />;
}

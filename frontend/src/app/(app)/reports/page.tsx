import { ReportsPage } from "@/components/reports/ReportsPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  await requirePage(["manager", "super_admin"]);
  return <ReportsPage />;
}

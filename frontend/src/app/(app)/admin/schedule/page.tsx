import { SchedulePage } from "@/components/admin/SchedulePage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  await requirePage(["super_admin"]);
  return <SchedulePage />;
}

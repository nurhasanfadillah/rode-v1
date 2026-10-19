import { TargetsPage } from "@/components/admin/TargetsPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  await requirePage(["super_admin"]);
  return <TargetsPage />;
}

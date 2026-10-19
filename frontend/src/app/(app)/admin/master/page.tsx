import { MasterPage } from "@/components/admin/MasterPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  await requirePage(["super_admin"]);
  return <MasterPage />;
}

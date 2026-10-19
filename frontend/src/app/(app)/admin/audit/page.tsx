import { AuditPage } from "@/components/admin/AuditPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  await requirePage(["super_admin"]);
  return <AuditPage />;
}

import { SettingsPage } from "@/components/admin/SettingsPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  await requirePage(["super_admin"]);
  return <SettingsPage />;
}

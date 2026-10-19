import { InputPage } from "@/components/input/InputPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  const user = await requirePage(["operator", "super_admin"]);
  return <InputPage user={user} />;
}

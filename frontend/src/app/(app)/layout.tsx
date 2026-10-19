import { AppShell } from "@/components/AppShell";
import { requirePage } from "@/lib/page-guard";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  return <AppShell user={user}>{children}</AppShell>;
}

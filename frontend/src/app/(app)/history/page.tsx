import { Suspense } from "react";
import { HistoryPage } from "@/components/history/HistoryPage";
import { requirePage } from "@/lib/page-guard";

export default async function Page() {
  const user = await requirePage();
  return <Suspense><HistoryPage user={user} /></Suspense>;
}

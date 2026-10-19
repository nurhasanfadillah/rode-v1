import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  redirect(u.role === "operator" ? "/input" : "/dashboard");
}

import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { getSessionUser } from "./auth";

export async function requirePage(roles?: Role[]) {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) redirect(u.role === "operator" ? "/input" : "/dashboard");
  return u;
}

import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const GET = handler(async () => ({ user: await requireUser() }));

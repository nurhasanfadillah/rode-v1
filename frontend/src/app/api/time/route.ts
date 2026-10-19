import { handler } from "@/lib/api";
import { jakartaParts } from "@/lib/time";

export const GET = handler(async () => {
  const now = new Date();
  return { serverTime: now.toISOString(), jakarta: jakartaParts(now) };
});

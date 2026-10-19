import { clientIp, handler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createDisplay, displaySchema, listDisplays } from "@/services/display";

export const GET = handler(async () => {
  await requireUser(["super_admin"]);
  return { items: await listDisplays() };
});

export const POST = handler(async (req) => {
  const user = await requireUser(["super_admin"]);
  return createDisplay(await parseBody(req, displaySchema), user.id, clientIp(req));
});

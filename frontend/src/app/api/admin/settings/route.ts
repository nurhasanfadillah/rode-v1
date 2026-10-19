import { clientIp, handler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSettings, settingsSchema, updateSettings } from "@/services/settings";

export const GET = handler(async () => {
  await requireUser(["super_admin"]);
  return getSettings();
});

export const PUT = handler(async (req) => {
  const user = await requireUser(["super_admin"]);
  return updateSettings(await parseBody(req, settingsSchema), user.id, clientIp(req));
});

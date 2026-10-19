import { z } from "zod";
import { clientIp, handler, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ENTITIES, updateEntity, type Entity } from "@/services/master";

export const PATCH = handler(async (req, ctx) => {
  const user = await requireUser(["super_admin"]);
  const { entity, id } = await ctx.params;
  if (!ENTITIES.includes(entity as Entity) || !z.string().uuid().safeParse(id).success) throw notFound();
  const body = await req.json().catch(() => ({}));
  return updateEntity(entity as Entity, id, body, user, clientIp(req));
});

import { clientIp, handler, notFound, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createEntity, ENTITIES, listEntity, listQuery, type Entity } from "@/services/master";

function entityOf(e: string): Entity {
  if (!ENTITIES.includes(e as Entity)) throw notFound("Entitas tidak dikenal.");
  return e as Entity;
}

export const GET = handler(async (req, ctx) => {
  await requireUser(["super_admin"]);
  return listEntity(entityOf((await ctx.params).entity), parseQuery(req, listQuery));
});

export const POST = handler(async (req, ctx) => {
  const user = await requireUser(["super_admin"]);
  const body = await req.json().catch(() => ({}));
  return createEntity(entityOf((await ctx.params).entity), body, user, clientIp(req));
});

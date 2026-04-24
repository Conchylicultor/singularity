import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { _agents } from "./tables";
import { agents } from "./schema";
import { agentsResource } from "./resources";

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
    prompt?: string | null;
    model?: string | null;
    expanded?: boolean;
    parentId?: string | null;
    rank?: string;
  };
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") patch.name = body.name;
  if (body.description === null || typeof body.description === "string") {
    patch.description = body.description;
  }
  if (body.prompt === null || typeof body.prompt === "string") {
    patch.prompt = body.prompt;
  }
  if (body.model === null || typeof body.model === "string") {
    patch.model = body.model;
  }
  if (typeof body.expanded === "boolean") patch.expanded = body.expanded;
  if (body.parentId === null || typeof body.parentId === "string") {
    if (body.parentId === id) {
      return new Response("Cannot parent an agent to itself", { status: 400 });
    }
    if (body.parentId !== null && (await isDescendant(id, body.parentId))) {
      return new Response("Cannot parent an agent under its own descendant", {
        status: 400,
      });
    }
    patch.parentId = body.parentId;
  }
  if (typeof body.rank === "string" && body.rank.length > 0) {
    patch.rank = body.rank;
  }
  const [updated] = await db
    .update(_agents)
    .set(patch)
    .where(eq(_agents.id, id))
    .returning({ id: _agents.id });
  if (!updated) return new Response("Not found", { status: 404 });
  if (typeof body.parentId === "string" && body.parentId.length > 0) {
    await db
      .update(_agents)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_agents.id, body.parentId));
  }
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  agentsResource.notify();
  return Response.json(row);
}

async function isDescendant(ancestorId: string, candidateId: string): Promise<boolean> {
  const all = await db
    .select({ id: _agents.id, parentId: _agents.parentId })
    .from(_agents);
  const byId = new Map(all.map((r) => [r.id, r.parentId] as const));
  let cur: string | null = candidateId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur) ?? null;
  }
  return false;
}

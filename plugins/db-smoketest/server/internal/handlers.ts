import { desc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { smoketest } from "../schema";

export async function handleWrite(req: Request): Promise<Response> {
  const body = (await req.json()) as { note?: unknown };
  if (typeof body.note !== "string" || !body.note.trim()) {
    return new Response("note (string) required", { status: 400 });
  }
  const id = crypto.randomUUID();
  await db.insert(smoketest).values({ id, note: body.note });
  return Response.json({ id, note: body.note });
}

export async function handleRead(_req: Request): Promise<Response> {
  const rows = await db
    .select()
    .from(smoketest)
    .orderBy(desc(smoketest.createdAt))
    .limit(100);
  return Response.json(rows);
}

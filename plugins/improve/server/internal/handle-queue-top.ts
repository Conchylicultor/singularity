import { z } from "zod";
import { db } from "@server/db/client";
import { _improvePendingQueueTop } from "./tables";

const Body = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
});

export async function handleQueueTop(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return new Response(`invalid body: ${parsed.error.message}`, { status: 400 });
  }
  const { taskIds } = parsed.data;
  await db
    .insert(_improvePendingQueueTop)
    .values(taskIds.map((taskId) => ({ taskId })))
    .onConflictDoNothing();
  return Response.json({ ok: true });
}

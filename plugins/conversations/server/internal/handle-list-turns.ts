import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _conversations } from "./tables";
import { findTranscriptPath, readTurns } from "./claude-transcript";

export async function handleListTurns(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const [row] = await db
    .select({ claudeSessionId: _conversations.claudeSessionId })
    .from(_conversations)
    .where(eq(_conversations.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  // No resolved Claude session yet (conversation just spawned, or runtime
  // doesn't surface one). Callers should retry after the poller fills it in.
  if (!row.claudeSessionId) return Response.json({ turns: [] });

  const path = await findTranscriptPath(row.claudeSessionId);
  if (!path) return Response.json({ turns: [] });

  const since = new URL(req.url).searchParams.get("since") ?? undefined;
  const turns = await readTurns(path, since);
  return Response.json({ turns });
}

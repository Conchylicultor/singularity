import { conversationNotes } from "./tables";
import { conversationNotesResource } from "./resource";

export async function handleUpsertNote(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const conversationId = params.conversationId;
  if (!conversationId) {
    return Response.json(
      { error: "Missing conversationId in path" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    notes?: unknown;
  } | null;
  if (typeof body?.notes !== "string" || body.notes.trim() === "") {
    return Response.json(
      { error: "notes (non-empty string) required" },
      { status: 400 },
    );
  }

  await conversationNotes.upsert(conversationId, { notes: body.notes });
  conversationNotesResource.notify();
  return Response.json({ ok: true });
}

export async function handleDeleteNote(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const conversationId = params.conversationId;
  if (!conversationId) {
    return Response.json(
      { error: "Missing conversationId in path" },
      { status: 400 },
    );
  }
  await conversationNotes.delete(conversationId);
  conversationNotesResource.notify();
  return Response.json({ ok: true });
}

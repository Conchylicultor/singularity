import { interruptConversation, rewindConversationTurn } from "./runtime";

export async function handleStop(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  try {
    await interruptConversation(id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
  const rewindText = await rewindConversationTurn(id);
  return Response.json({ ok: true, rewindText: rewindText ?? null });
}

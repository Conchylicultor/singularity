import { sendTurn } from "./runtime";

export async function handlePostTurn(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof body.text !== "string" || body.text.length === 0) {
    return Response.json({ error: "body.text required" }, { status: 400 });
  }

  try {
    await sendTurn(id, body.text);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
  return Response.json({ ok: true });
}

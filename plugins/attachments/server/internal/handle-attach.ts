import { attachAttachment } from "./api";

export async function handleAttach(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });

  const body = (await req.json().catch(() => null)) as
    | { ownerType?: string; ownerId?: string }
    | null;
  if (!body || typeof body.ownerType !== "string" || typeof body.ownerId !== "string") {
    return new Response("body must be { ownerType, ownerId }", { status: 400 });
  }
  if (!body.ownerType || !body.ownerId) {
    return new Response("ownerType and ownerId must be non-empty", { status: 400 });
  }

  const attached = await attachAttachment(id, body.ownerType, body.ownerId);
  if (!attached) {
    return new Response("attachment not found or already attached", { status: 409 });
  }
  return Response.json(attached);
}

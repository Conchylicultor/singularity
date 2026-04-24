import { listAttachmentsForOwner } from "./api";

export async function handleList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ownerType = url.searchParams.get("ownerType");
  const ownerId = url.searchParams.get("ownerId");
  if (!ownerType || !ownerId) {
    return new Response("ownerType and ownerId query params required", { status: 400 });
  }
  const rows = await listAttachmentsForOwner(ownerType, ownerId);
  return Response.json(rows);
}

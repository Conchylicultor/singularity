import { get } from "./store";

export function handleGet(
  _req: Request,
  params: Record<string, string>,
): Response {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });
  const png = get(id);
  if (!png) return new Response("not found", { status: 404 });
  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=3600",
    },
  });
}

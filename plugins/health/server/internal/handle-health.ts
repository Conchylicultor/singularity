const startedAt = Date.now();

export function handleHealth(): Response {
  return Response.json({ ok: true, startedAt });
}

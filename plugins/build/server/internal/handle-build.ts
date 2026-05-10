import { triggerBuild } from "./run-build";

export function handleBuild(_req: Request): Response {
  triggerBuild("manual");
  return Response.json({ ok: true });
}

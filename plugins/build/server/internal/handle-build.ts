import { runBuild } from "./run-build";

export function handleBuild(_req: Request): Response {
  runBuild("manual").catch(() => {});
  return Response.json({ ok: true });
}

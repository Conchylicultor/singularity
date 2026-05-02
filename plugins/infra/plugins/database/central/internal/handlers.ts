import { ready, status } from "./supervisor";

export async function handleStatus(_req: Request): Promise<Response> {
  // Wait briefly so callers like `./singularity build` can poll a single
  // endpoint instead of hand-rolling readiness loops on top of /status.
  await Promise.race([ready, Bun.sleep(60_000)]).catch(() => {});
  return Response.json(status());
}

import { getProfilingData } from "@server/profiler";

export function handleProfiling(_req: Request): Response {
  return Response.json(getProfilingData());
}

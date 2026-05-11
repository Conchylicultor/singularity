import { getProfilingData } from "@server/profiler";

export function handleBootProfiling(_req: Request): Response {
  const server = getProfilingData();
  return Response.json({
    spans: server.spans,
    totalMs: server.totalDurationMs,
  });
}

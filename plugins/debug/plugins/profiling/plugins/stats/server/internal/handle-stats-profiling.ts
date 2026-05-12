interface Span {
  id: string;
  phase: string;
  label: string;
  startMs: number;
  durationMs: number;
}

const ENDPOINTS = [
  { url: "/api/stats/commits/cumulative", phase: "stats:commits", label: "commits/cumulative" },
  { url: "/api/stats/commits/rate?bucket=day", phase: "stats:commits", label: "commits/rate" },
  { url: "/api/stats/commits/lines/cumulative", phase: "stats:commits", label: "lines/cumulative" },
  { url: "/api/stats/commits/lines/rate?bucket=day", phase: "stats:commits", label: "lines/rate" },
  { url: "/api/stats/cost/totals?scope=singularity", phase: "stats:cost", label: "cost/totals" },
  { url: "/api/stats/cost/daily?scope=singularity", phase: "stats:cost", label: "cost/daily" },
  { url: "/api/stats/cost/daily-by-family?scope=singularity", phase: "stats:cost", label: "cost/daily-by-family" },
  { url: "/api/stats/cost/cumulative?scope=singularity", phase: "stats:cost", label: "cost/cumulative" },
  { url: "/api/stats/cost/token-mix?scope=singularity", phase: "stats:cost", label: "cost/token-mix" },
  { url: "/api/stats/cost/sessions?limit=50&scope=singularity", phase: "stats:cost", label: "cost/sessions" },
  { url: "/api/stats/cost/distribution?scope=singularity", phase: "stats:cost", label: "cost/distribution" },
  { url: "/api/stats/cost/avg-per-conversation?scope=singularity", phase: "stats:cost", label: "cost/avg-per-conv" },
  { url: "/api/stats/tasks/cumulative", phase: "stats:tasks", label: "tasks/cumulative" },
  { url: "/api/stats/tasks/daily", phase: "stats:tasks", label: "tasks/daily" },
] as const;

function parseServerTimingChildren(
  header: string | null,
  parentId: string,
  parentPhase: string,
  parentStartMs: number,
): Span[] {
  if (!header) return [];
  const children: Span[] = [];
  let offset = 0;
  for (const entry of header.split(",")) {
    const parts = entry.trim().split(";");
    const name = parts[0]?.trim();
    if (!name || name === "total") continue;
    let dur = 0;
    for (const p of parts.slice(1)) {
      const m = p.trim().match(/^dur=(\d+(?:\.\d+)?)$/);
      if (m) dur = parseFloat(m[1]!);
    }
    if (dur > 0) {
      children.push({
        id: `${parentId}:${name}`,
        phase: parentPhase,
        label: `  ${name}`,
        startMs: parentStartMs + offset,
        durationMs: dur,
      });
      offset += dur;
    }
  }
  return children;
}

export async function handleStatsProfiling(_req: Request): Promise<Response> {
  const socketPath = process.env.SOCKET_PATH;
  if (!socketPath) {
    return Response.json({ spans: [], totalMs: 0 });
  }

  const t0 = performance.now();

  const results = await Promise.all(
    ENDPOINTS.map(async (ep) => {
      const fetchStart = performance.now() - t0;
      try {
        const res = await fetch(`http://localhost${ep.url}`, { unix: socketPath } as any);
        const fetchDuration = performance.now() - t0 - fetchStart;
        const serverTimingHeader = res.headers.get("Server-Timing");
        return { ep, fetchStart, fetchDuration, serverTimingHeader };
      } catch {
        const fetchDuration = performance.now() - t0 - fetchStart;
        return { ep, fetchStart, fetchDuration, serverTimingHeader: null };
      }
    }),
  );

  const totalMs = performance.now() - t0;

  const spans: Span[] = [];
  for (const { ep, fetchStart, fetchDuration, serverTimingHeader } of results) {
    spans.push({
      id: ep.label,
      phase: ep.phase,
      label: ep.label,
      startMs: fetchStart,
      durationMs: fetchDuration,
    });
    spans.push(
      ...parseServerTimingChildren(serverTimingHeader, ep.label, ep.phase, fetchStart),
    );
  }

  return Response.json({ spans, totalMs });
}

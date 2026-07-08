// Read-side incident grouping — pure, no React, no IO. Both the Events list and
// the trace detail import it. Every trace IS a wall-clock interval:
//   end = Date.parse(wallTime); start = end − windowSpanMs
// so time-overlap grouping is computable entirely from the list metadata (no new
// column, no incident-id plumbing). See the plan doc.

export interface IncidentInfo {
  /** Stable index within this result set (0-based, assigned in start order). */
  incidentId: number;
  /** # traces in the incident (≥1). */
  size: number;
  /** incidentId % PALETTE_LEN — a stable per-incident tint. */
  colorIndex: number;
}

// A stable categorical tint palette — single-sourced here so the badge dot color
// always matches an IncidentInfo.colorIndex. Uses the themeable categorical
// tokens (the sanctioned palette for hash-assigned chips; values live in the
// theme, not here), so the tints track the active preset and pass the
// no-hardcoded-colors check.
export const INCIDENT_PALETTE = [
  "bg-categorical-1",
  "bg-categorical-2",
  "bg-categorical-3",
  "bg-categorical-4",
  "bg-categorical-5",
  "bg-categorical-6",
  "bg-categorical-7",
  "bg-categorical-8",
] as const;

export const PALETTE_LEN = INCIDENT_PALETTE.length;

/** Tailwind bg-* class for an incident's colorIndex. */
export function incidentColorClass(colorIndex: number): string {
  return INCIDENT_PALETTE[colorIndex % PALETTE_LEN] ?? INCIDENT_PALETTE[0];
}

/** Overlap test for two closed wall-clock intervals (touching edges count). */
export function overlaps(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  return a.startMs <= b.endMs && b.startMs <= a.endMs;
}

/**
 * Sweep-union of overlapping wall-clock intervals (transitive: A∩B, B∩C ⇒ one
 * incident even if A∌C — a connected chain of overlapping activity is one
 * incident). O(n log n). Returns a lookup keyed by trace id, carrying every id
 * (solo traces get size 1) so callers never special-case.
 */
export function groupIncidents(
  items: { id: string; wallTime: string; windowSpanMs: number }[],
): Map<string, IncidentInfo> {
  const intervals = items.map((it) => {
    const endMs = Date.parse(it.wallTime);
    return { id: it.id, startMs: endMs - it.windowSpanMs, endMs };
  });
  // Stable sort by start (ties keep input order — a stable Array.sort).
  intervals.sort((a, b) => a.startMs - b.startMs);

  // Pass 1: assign each id an incident index via the sweep; tally sizes.
  const idToIncident = new Map<string, number>();
  const sizes = new Map<number, number>();
  let curIncident = -1;
  let curEnd = -Infinity;
  for (const iv of intervals) {
    if (iv.startMs <= curEnd) {
      curEnd = Math.max(curEnd, iv.endMs); // join the current incident
    } else {
      curIncident += 1; // open a new incident
      curEnd = iv.endMs;
    }
    idToIncident.set(iv.id, curIncident);
    sizes.set(curIncident, (sizes.get(curIncident) ?? 0) + 1);
  }

  // Pass 2: stamp size + colorIndex per id.
  const out = new Map<string, IncidentInfo>();
  for (const [id, incidentId] of idToIncident) {
    out.set(id, {
      incidentId,
      size: sizes.get(incidentId) ?? 1,
      colorIndex: incidentId % PALETTE_LEN,
    });
  }
  return out;
}

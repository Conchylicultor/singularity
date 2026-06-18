import { readChannelEntries } from "@plugins/primitives/plugins/log-channels/server";
import { SlowOpMarkerSchema, type SlowOpMarker } from "../../core";

// Cap on marker lines read per worktree file (newest kept). Generous so a chatty
// backend's window is never truncated before the health pane's read window cuts
// it off; the web layer coalesces markers to the 10s sample grid regardless.
const MAX_LINES = 5000;

// Read this worktree's slow-op markers from its persisted `slow-op-markers`
// channel (logs/slow-op-markers.jsonl), mirroring health-monitor's parseSamples:
// each entry is a log-channel envelope ({ t, stream, line }); the marker JSON is
// in `line`. Parse, validate, and filter to the read window.
export function readSlowOpMarkers(
  worktree: string,
  windowMs: number,
): SlowOpMarker[] {
  const cutoff = Date.now() - windowMs;
  const entries = readChannelEntries(worktree, "slow-op-markers", MAX_LINES);
  if (!entries) return [];
  const out: SlowOpMarker[] = [];
  for (const entry of entries) {
    let obj: unknown;
    try {
      obj = JSON.parse(entry.line);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
    const parsed = SlowOpMarkerSchema.safeParse(obj);
    if (parsed.success && parsed.data.atTime.getTime() >= cutoff) {
      out.push(parsed.data);
    }
  }
  return out;
}

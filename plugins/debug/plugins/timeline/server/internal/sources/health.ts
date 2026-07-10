import {
  HealthSampleSchema,
  HostSampleSchema,
  type HealthSample,
  type HostSample,
} from "@plugins/debug/plugins/health-monitor/server";
import { readChannelEntries } from "@plugins/primitives/plugins/log-channels/server";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/server";
import type { TimelineHealthPoint } from "../../../shared/frames";
import { backendHealthPoints, hostHealthPoints } from "./health-map";

// Lines read per file, newest kept. The sampler writes every 10s, so a 24h
// window is ~8640 lines; this covers it with headroom. (health-monitor's own
// reader caps at 1500 because its pane defaults to a 2h window — the timeline
// offers up to 24h presets, hence its own cap.)
const MAX_LINES = 12_000;

// Each entry is a log-channel envelope ({ t, stream, line }); the sample JSON
// is in `line`. Parse the inner payload and safeParse-drop malformed /
// old-shape lines — mirrors health-monitor's read-health-files.ts.
function parseSamples<T>(
  worktree: string,
  channel: string,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
): T[] {
  const entries = readChannelEntries(worktree, channel, MAX_LINES);
  if (!entries) return [];
  const out: T[] = [];
  for (const entry of entries) {
    let obj: unknown;
    try {
      obj = JSON.parse(entry.line);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
    const parsed = schema.safeParse(obj);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// One backend lane's downsampled heat-strip series (may be empty — a worktree
// dir without health history is a legitimately-empty lane, not a failure).
export function readHealthLane(
  worktree: string,
  fromMs: number,
  toMs: number,
): TimelineHealthPoint[] {
  const samples = parseSamples<HealthSample>(worktree, "health", HealthSampleSchema);
  return backendHealthPoints(samples, fromMs, toMs);
}

// The host lane (load average + swap), sampled only by the main backend.
export function readHostLane(fromMs: number, toMs: number): TimelineHealthPoint[] {
  const samples = parseSamples<HostSample>(MAIN_WORKTREE_NAME, "health-host", HostSampleSchema);
  return hostHealthPoints(samples, fromMs, toMs);
}

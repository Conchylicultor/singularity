import { listWorktreeDirs, MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/server";
import { readChannelEntries } from "@plugins/primitives/plugins/log-channels/server";
import { readSlowOpMarkers } from "@plugins/debug/plugins/slow-ops/server";
import {
  HealthSampleSchema,
  HostSampleSchema,
  type HealthSample,
  type HealthSeries,
  type HostSample,
} from "../../shared/schema";

// Cap on lines read per worktree file (newest kept). At 10s/sample, 1500 lines
// is ~4h of history — comfortably above the default 2h read window.
const MAX_LINES = 1500;

// Each entry is a log-channel envelope ({ t, stream, line }); the sample JSON is
// in `line`. Parse the inner payload and validate it.
function parseSamples<T>(
  worktree: string,
  channel: string,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  cutoff: number,
  sampledAt: (v: T) => number,
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
    if (parsed.success && sampledAt(parsed.data) >= cutoff) out.push(parsed.data);
  }
  return out;
}

export function readHealthSeries(windowMs: number): {
  series: HealthSeries[];
  hostSamples: HostSample[];
} {
  const cutoff = Date.now() - windowMs;

  const series: HealthSeries[] = [];
  for (const name of listWorktreeDirs()) {
    const samples = parseSamples<HealthSample>(
      name,
      "health",
      HealthSampleSchema,
      cutoff,
      (s) => s.sampledAt,
    );
    if (samples.length) {
      const slowOpMarkers = readSlowOpMarkers(name, windowMs);
      series.push({ worktree: name, samples, slowOpMarkers });
    }
  }

  const hostSamples = parseSamples<HostSample>(
    MAIN_WORKTREE_NAME,
    "health-host",
    HostSampleSchema,
    cutoff,
    (s) => s.sampledAt,
  );

  return { series, hostSamples };
}

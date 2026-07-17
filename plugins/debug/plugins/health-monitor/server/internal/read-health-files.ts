import { listWorktreeDirs, MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/server";
import { readChannelJson } from "@plugins/primitives/plugins/log-channels/server";
import { readSlowOpMarkers } from "@plugins/debug/plugins/slow-ops/server";
import type { ZodType } from "zod";
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

// Read a channel's JSON payloads (envelope-unwrap + safeParse-drop via the
// log-channels primitive) and keep only samples at/after the read cutoff.
function parseSamples<T>(
  worktree: string,
  channel: string,
  schema: ZodType<T>,
  cutoff: number,
  sampledAt: (v: T) => number,
): T[] {
  return readChannelJson(worktree, channel, MAX_LINES, schema).filter(
    (v) => sampledAt(v) >= cutoff,
  );
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

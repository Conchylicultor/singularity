import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushesStepBreakdown } from "../../shared/endpoints";
import { readCompletedPushes } from "./read-pushes";
import { keyFor } from "./buckets";

// Keyed on the step names the push CLI emits. Those names were NOT changed by
// the op-log cutover — `push.ts` still marks the same steps — so this table
// keeps grouping both new and legacy records. Anything unmapped falls to "other".
const STEP_GROUPS: Record<string, string> = {
  fetch: "fetch",
  "ff-main": "fetch",
  rebase: "rebase",
  checks: "checks",
  "push-branch": "push",
  "ff-merge": "push",
  "push-main": "push",
  "bun-install": "other",
  normalize: "other",
};

export const handleStepBreakdown = implement(getPushesStepBreakdown, async ({ query }) => {
  const bucket = query.bucket ?? "day";
  const records = readCompletedPushes();

  const buckets = new Map<
    string,
    { sums: Record<string, number>; count: number }
  >();

  for (const r of records) {
    // See handle-throughput.ts on `requestedAt` vs the legacy `startedAt`.
    const k = keyFor(r.requestedAt, bucket);
    let entry = buckets.get(k);
    if (!entry) {
      entry = { sums: { fetch: 0, rebase: 0, checks: 0, push: 0, other: 0 }, count: 0 };
      buckets.set(k, entry);
    }
    entry.count++;
    for (const step of r.steps) {
      const group = STEP_GROUPS[step.name] ?? "other";
      entry.sums[group] = (entry.sums[group] ?? 0) + step.durationMs;
    }
  }

  const avgSeconds = (entry: { sums: Record<string, number>; count: number }, group: string) =>
    Math.round(((entry.sums[group] ?? 0) / entry.count / 1000) * 100) / 100;

  const points = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, entry]) => ({
      bucket: date,
      fetch: avgSeconds(entry, "fetch"),
      rebase: avgSeconds(entry, "rebase"),
      checks: avgSeconds(entry, "checks"),
      push: avgSeconds(entry, "push"),
      other: avgSeconds(entry, "other"),
    }));

  return { points };
});

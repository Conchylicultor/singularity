import { z } from "zod";

// The optimistic-divergence report payload, stored in the generic `data` jsonb
// column and validated on ingest by the optimistic-divergence ReportKind.
// Mirrors `OptimisticDivergenceReport`, the neutral body the optimistic-mutation
// primitive emits into its report sink — this schema is the ingest-side contract
// for that same shape.
export const OptimisticDivergencePayloadSchema = z.object({
  // The live-state resource key whose overlay op was never confirmed.
  resourceKey: z.string(),
  // The resource params the diverging consumer subscribed with, if any.
  params: z.record(z.string()).nullable(),
  // The consumer's `label` ("what is being saved"), if it passed one.
  label: z.string().nullable(),
  // Consecutive authoritative pushes that failed to confirm the op before it was
  // dropped. Volatile — deliberately excluded from the fingerprint.
  misses: z.number(),
  // Per-op `describeOp(vars)` summaries for the diverged ops (never raw vars,
  // which are unbounded and possibly unserializable).
  opSummaries: z.array(z.string()),
});
export type OptimisticDivergencePayload = z.infer<
  typeof OptimisticDivergencePayloadSchema
>;

// Divergence fingerprint = sha256(resourceKey + label + opSummaries), first 16
// hex chars. `misses` is EXCLUDED: it is the miss count observed at the instant
// this particular op gave up, so it varies between otherwise-identical repeats
// of the same bug (a cascade drop can end a run at 1, a quiet resource at 3).
// Including it would split one broken `apply`/`isConfirmedBy` pair across
// several rows. `params` is also excluded — the same buggy pair diverges on
// every page/conversation it is used with, and those are one bug, not N.
export async function optimisticDivergenceFingerprint(
  data: OptimisticDivergencePayload,
): Promise<string> {
  const input = `${data.resourceKey}|${data.label ?? ""}|${data.opSummaries.join(",")}`;
  return sha256Hex(input).then((h) => h.slice(0, 16));
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

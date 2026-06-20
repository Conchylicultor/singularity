import { z } from "zod";

// Tunable constants for the client-side render-loop detector. Single source of
// truth (imported by the detector via the core barrel) so the heuristic's
// thresholds live next to the schema/fingerprint that consume their output.
export const RENDER_LOOP = {
  // Sliding-window length for the per-signature rate counters.
  WINDOW_MS: 1000,
  // A signature must stay above its class threshold continuously this long
  // before it fires — excludes one-off bursts (live-state, layout settle).
  SUSTAINED_MS: 3000,
  // childList identical-rebuild threshold (rebuilds/sec).
  REBUILD_PER_SEC: 3,
  // no-op / oscillating attribute-write threshold (writes/sec).
  NOOP_ATTR_PER_SEC: 30,
  // No qualifying user interaction within this window → "idle".
  IDLE_MS: 2000,
  // Per-(signature, attr) ring of recent attribute values used to detect
  // oscillation (a small set of values cycled, vs monotonic progress).
  VALUE_RING: 8,
  // Oscillation: at most this many distinct values in the ring …
  MAX_DISTINCT_VALUES: 4,
  // … with at least one value revisited this many times.
  MIN_VALUE_REPEAT: 3,
  // bounded `nth-of-type` path depth from the node up to the marker anchor.
  PATH_MAX_DEPTH: 4,
  // Hard cap on the serialized signature string length.
  SIGNATURE_CAP: 256,
  // Drop a per-signature counter once it's been idle longer than this (GC).
  GC_IDLE_MS: 5000,
  // Throttle near-miss log lines to at most one per signature per this window,
  // so a sustained idle non-wasted update can't flood the clientLog buffer.
  NEAR_MISS_LOG_MS: 10000,
} as const;

// The render-loop report payload, stored in the generic `data` jsonb column and
// validated on ingest by the render-loop ReportKind. Captures the stable culprit
// signature, its composition markers, the detected mutation class, and the rate
// / timing context (the latter excluded from the fingerprint so repeats dedup).
export const RenderLoopPayloadSchema = z.object({
  signature: z.string(),
  pluginId: z.string().nullable().optional(),
  slotId: z.string().nullable().optional(),
  contributionId: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  paneId: z.string().nullable().optional(),
  selector: z.string().nullable().optional(),
  mutationClass: z.enum(["noop-attr", "oscillating-attr", "childlist-rebuild"]),
  attrName: z.string().nullable().optional(),
  ratePerSec: z.number(),
  sustainedMs: z.number(),
  sampleValues: z.array(z.string()).nullable().optional(),
  tagMultiset: z.array(z.string()).nullable().optional(),
  visibilityState: z.string(),
  msSinceInteraction: z.number(),
});
export type RenderLoopPayload = z.infer<typeof RenderLoopPayloadSchema>;

// Render-loop fingerprint = sha256(signature + mutationClass + attrName), first
// 16 hex chars. Rate/timing are EXCLUDED so every repeat of the same pathological
// loop dedups onto one row/task (same pattern as crashFingerprint).
export async function renderLoopFingerprint(
  data: RenderLoopPayload,
): Promise<string> {
  const input = `${data.signature}|${data.mutationClass}|${data.attrName ?? ""}`;
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

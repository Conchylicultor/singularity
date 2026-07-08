import { implement } from "@plugins/infra/plugins/endpoints/server";
import { recordEntrySpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { testTrigger } from "../../shared/endpoints";
import { captureTrace } from "./capture";

// Verification endpoint. Runs a REAL entry span first (so the flight ring +
// open-entry registry actually have content the spans class can capture), then
// calls captureTrace with a synthetic trigger — exercising admission →
// coherent-instant capture → enrich → persist end-to-end from one POST. Mirrors
// flight-recorder's handle-test-slow-op, but calls the generic captureTrace
// directly (there is no slow-span installer in this phase — Phase 3 adds it).
export const handleTestTrigger = implement(testTrigger, async ({ body }) => {
  const label = body.label ?? "trace-test";
  await recordEntrySpan(
    "loader",
    label,
    () => new Promise<void>((resolve) => setTimeout(resolve, body.ms)),
  );
  const result = captureTrace({
    kind: "loader",
    label,
    durationMs: body.ms,
    thresholdMs: 0,
  });
  return { ok: true, id: result?.id ?? null };
});

import { implement } from "@plugins/infra/plugins/endpoints/server";
import { recordEntrySpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { testSlowOp } from "../../shared/endpoints";

// Deliberately a REAL entry span (not a direct persistSnapshot call) so the
// whole pipeline — recorder → onSlowSpan → threshold gate → rate-limit →
// capture → persist — is exercised end-to-end by one POST.
export const handleTestSlowOp = implement(testSlowOp, async ({ body }) => {
  await recordEntrySpan(
    "loader",
    body.label ?? "flight-recorder-test",
    () => new Promise<void>((resolve) => setTimeout(resolve, body.ms)),
  );
  return { ok: true };
});

import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Verification endpoint: runs a real entry span that sleeps for `ms`, so the
// WHOLE pipeline (recorder → onSlowSpan → rate-limit → capture → persist) is
// exercised end-to-end — not a shortcut into persistSnapshot.
export const testSlowOp = defineEndpoint({
  route: "POST /api/debug/flight-recorder/test-slow-op",
  body: z.object({ ms: z.number(), label: z.string().optional() }),
  response: z.object({ ok: z.boolean() }),
});

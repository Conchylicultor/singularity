import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// One-shot snapshot fetched at boot to hydrate the live-state cache before first
// paint. `resources` maps each boot-critical resource's KEY to its freshly
// loaded value; the client matches keys against its registered descriptors and
// `hydrateResource(...)`s each one, so the first render reads real data instead
// of `pending`/defaults — no flash, no WS round-trip.
//
// Scope: param-less GLOBAL resources only (the server can't know a client's
// route params at snapshot time). A failed loader is omitted from the map (not
// fatal) — that key simply falls back to its normal WS sub-ack, now fast because
// the same tables were warmed server-side at boot.
//
// NOTE: the plan's `version` per entry is intentionally omitted — `hydrateResource`
// doesn't consume it and the version-aware sub-skip (Phase D) is out of scope.
//
// `timings` is additive (existing `{ resources }` consumers keep working): per-key
// server work time — a persisted-read share for the L2 fast path, or the individual
// loader duration for keys that fell back to a from-scratch load — consumed by the
// boot profiler to split wait vs work.
export const bootSnapshot = defineEndpoint({
  route: "GET /api/resources/boot-snapshot",
  response: z.object({
    resources: z.record(z.string(), z.unknown()),
    timings: z.record(
      z.string(),
      z.object({
        source: z.enum(["persisted", "loader"]),
        workMs: z.number(),
      }),
    ),
  }),
});

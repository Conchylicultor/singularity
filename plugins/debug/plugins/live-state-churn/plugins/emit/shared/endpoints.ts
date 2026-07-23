import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { MAX_EMIT_RATE, EmitStatusSchema } from "../core";

// EmitStatusSchema lives in core/ because the window-level global API — whose
// methods all resolve to an EmitStatus — is a contract shared with the e2e
// driver, and e2e may import core but not shared. See core/global-api.ts.
export { EmitStatusSchema };
export type { EmitStatus } from "../core";

export const startEmit = defineEndpoint({
  route: "POST /api/debug/live-state-emit/start",
  body: z.object({
    key: z.string(),
    rate: z.number().min(0.1).max(MAX_EMIT_RATE),
    durationMs: z.number().positive().optional(),
  }),
  response: EmitStatusSchema,
});

export const stopEmit = defineEndpoint({
  route: "POST /api/debug/live-state-emit/stop",
  response: EmitStatusSchema,
});

export const getEmitStatus = defineEndpoint({
  route: "GET /api/debug/live-state-emit/status",
  response: EmitStatusSchema,
  dedupe: true,
});

// A minimal typed view of the kernel-served `GET /api/resources/_debug` route,
// to populate the resource dropdown. The route is handled INSIDE the shared
// resource runtime (`handleResourcesDebug`) — that handler stays the single
// authoritative source; this endpoint only declares the contract so the pane can
// `useEndpoint` it. `shared/` is plugin-private, so we cannot import read-set's
// or live-state-health's view of the same route — declaring a second contract
// over the same route is the established pattern (zod strips unknown keys, so the
// views coexist). We model only what the dropdown consumes (`key`, `mode`,
// `subscribers`); `.passthrough()` tolerates the rest of the rich kernel payload.
export const listResourcesForEmit = defineEndpoint({
  route: "GET /api/resources/_debug",
  response: z
    .object({
      resources: z.array(
        z
          .object({
            key: z.string(),
            mode: z.string(),
            subscribers: z.number(),
          })
          .passthrough(),
      ),
    })
    .passthrough(),
});

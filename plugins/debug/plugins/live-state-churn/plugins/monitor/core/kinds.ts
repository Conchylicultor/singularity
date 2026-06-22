import { z } from "zod";

// The jsonb payload for a `live-state-noop` report. One report per distinct
// resource key (fingerprint `live-state-noop:<resourceKey>`), so a sustained
// churn on one resource collapses to a single task. Carries the per-key rollup
// over the trailing window: how many no-op (empty-diff) pushes fired vs total
// pushes, the measured per-second no-op rate, the subscriber count those wasted
// frames reached, and the window width the rate was computed over.
export const LiveStateNoopPayloadSchema = z.object({
  resourceKey: z.string(),
  noopRate: z.number(),
  noopCount: z.number().int(),
  totalCount: z.number().int(),
  subscribers: z.number().int(),
  windowSeconds: z.number().int(),
});
export type LiveStateNoopPayload = z.infer<typeof LiveStateNoopPayloadSchema>;

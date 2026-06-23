import { z } from "zod";

// The jsonb payload for an `op-rate` report. One report per distinct hot op
// (`${kind}:${label}`), so a single hammered op gets its own task pointing
// straight at the cause. The payload carries the call-rate snapshot that tripped
// the threshold: which op, how many calls landed in the window, how long the
// window was, and the per-kind threshold it exceeded.
export const OpRatePayloadSchema = z.object({
  kind: z.string(),
  label: z.string(),
  callsInWindow: z.number().int(),
  windowMs: z.number().int(),
  threshold: z.number().int(),
});
export type OpRatePayload = z.infer<typeof OpRatePayloadSchema>;

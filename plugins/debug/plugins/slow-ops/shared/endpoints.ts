import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ClientBootSectionSchema } from "@plugins/debug/plugins/trace/plugins/client-boot/core";
import { CallerRefSchema, MAX_CLIENT_SLOW_OP_ITEMS } from "../core";

// One client-side slow-op signal (page-load, element-settle). `operationKind`
// is "page-load" | "element". A client origin has no enclosing server span, so
// the `element` signal supplies its own caller — the route that issued it
// ({ kind: "route", label: pathname }) — for caller attribution. The server
// stamps the worktree; the client only supplies the measurement.
export const SlowOpClientItemSchema = z.object({
  operationKind: z.string(),
  operation: z.string(),
  durationMs: z.number(),
  thresholdMs: z.number(),
  caller: CallerRefSchema.optional(),
  // Additive, backward-compatible cold-start attribution for the `element`
  // signal (absent for page-load and older clients). `transportColdStart` marks
  // that the notifications transport was not ready when the resource mounted;
  // `transportWaitMs` is the portion of the settle window spent on transport
  // bring-up. Charged to a `notifications-transport` wait layer + surfaced in
  // the report so a slow settle reads as transport time-to-first-data, not
  // resource compute.
  transportColdStart: z.boolean().optional(),
  transportWaitMs: z.number().optional(),
  // Additive, backward-compatible client evidence for the `page-load` signal
  // (absent for `element` and older clients): the browser's own boot
  // decomposition (perfs/boot-trace), trimmed by toClientBootSection so the
  // keepalive beacon stays small. The handler threads it into the page-load
  // trigger's detail, where the client-boot trace class validates and persists
  // it; recordSlowOp never sees it.
  clientBoot: ClientBootSectionSchema.optional(),
});
export type SlowOpClientItem = z.infer<typeof SlowOpClientItemSchema>;

// The beacon carries a BATCH. One POST per slow element amplified the very
// stall it reported (438 calls / 43.2s of server time in one 24s incident —
// research/2026-09-02-global-alert-fan-out-ceiling.md), so the browser queue
// debounces and chunks instead. `dropped` is how many items the queue had to
// discard under its own cap since the last batch: the loss is reported, never
// silent. Deliberately NOT backward-compatible with the old single-item body —
// a stale tab's beacon 400s silently, which is the right outcome for a
// `report: false` telemetry beacon.
export const SlowOpClientBodySchema = z.object({
  items: z.array(SlowOpClientItemSchema).min(1).max(MAX_CLIENT_SLOW_OP_ITEMS),
  dropped: z.number().optional(),
});
export type SlowOpClientBody = z.infer<typeof SlowOpClientBodySchema>;

export const submitClientSlowOp = defineEndpoint({
  route: "POST /api/slow-ops/client",
  body: SlowOpClientBodySchema,
  response: z.object({ ok: z.boolean() }),
});

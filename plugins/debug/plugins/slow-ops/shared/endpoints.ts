import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ClientBootSectionSchema } from "@plugins/debug/plugins/trace/plugins/client-boot/core";
import { CallerRefSchema } from "../core";

// The two client-side slow-op signals (page-load, element-settle) POST here.
// `operationKind` is "page-load" | "element". A client origin has no enclosing
// server span, so the `element` signal supplies its own caller — the route that
// issued it ({ kind: "route", label: pathname }) — for caller attribution. The
// server stamps the worktree; the client only supplies the measurement.
export const SlowOpClientBodySchema = z.object({
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
export type SlowOpClientBody = z.infer<typeof SlowOpClientBodySchema>;

export const submitClientSlowOp = defineEndpoint({
  route: "POST /api/slow-ops/client",
  body: SlowOpClientBodySchema,
  response: z.object({ ok: z.boolean() }),
});

import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";
import type { TripContext } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { StallSectionSchema, type StallSection } from "../../core";

// The stall class is TRIGGER-OWNED: unlike spans/gates (which read ambient
// in-memory state at the trip instant), the stack evidence is pre-aggregated by
// the health-monitor sampler — the raw JSC traces (thousands per freeze) are far
// too large to carry, and the drain must happen on the sampler's own tick to
// bound memory. So the sampler builds the StallSection and hands it in via
// `trigger.detail`, and this passthrough is a cheap synchronous read gated on the
// "stall" kind. Every OTHER trip (a slow span, an op-time breach) returns
// undefined, so a non-stall trace gets no empty stall section.
export function captureStallSection(ctx: TripContext): StallSection | undefined {
  return ctx.trigger.kind === "stall"
    ? (ctx.trigger.detail as StallSection)
    : undefined;
}

export const stallClass = defineTraceEventClass({
  id: "stall",
  schema: StallSectionSchema,
  captureAtTrip: captureStallSection,
});

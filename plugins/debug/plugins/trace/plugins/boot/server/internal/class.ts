import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";
import type { TripContext } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { BootSectionSchema, type BootSection } from "../../core";

// The boot class is TRIGGER-OWNED (the stall precedent): unlike spans/gates
// (which read ambient in-memory state at the trip instant), the boot profile is
// pre-aggregated by debug/boot-monitor — the mint happens on a minute tick long
// after boot completed, so there is no live instant to capture; the producer
// builds the BootSection from getProfilingData() (+ the gateway report box) and
// hands it in via `trigger.detail`. This passthrough is a cheap synchronous read
// gated on the "boot" kind. Every OTHER trip (a slow span, an op-time breach)
// returns undefined, so a non-boot trace gets no empty boot section.
export function captureBootSection(ctx: TripContext): BootSection | undefined {
  return ctx.trigger.kind === "boot"
    ? (ctx.trigger.detail as BootSection)
    : undefined;
}

export const bootClass = defineTraceEventClass({
  id: "boot",
  schema: BootSectionSchema,
  captureAtTrip: captureBootSection,
});

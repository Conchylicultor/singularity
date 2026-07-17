import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";
import type { TripContext } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { ClientBootSectionSchema, type ClientBootSection } from "../../core";

// The client-boot class is TRIGGER-OWNED (the stall precedent): the browser
// builds the section itself — `toClientBootSection(getBootTrace())` in the
// slow-op collector — and it rides the page-load beacon into the trigger's
// detail (`handle-client-slow-op` forwards the body's `clientBoot`). The server
// has no ambient client state to read at the trip instant, so this passthrough
// is a cheap synchronous read gated on the "page-load" kind AND payload
// presence: an older client (or any non-page-load trip) yields undefined and
// the section is omitted — never faked.
export function captureClientBootSection(
  ctx: TripContext,
): ClientBootSection | undefined {
  return ctx.trigger.kind === "page-load"
    ? (ctx.trigger.detail as { clientBoot?: ClientBootSection } | undefined)
        ?.clientBoot
    : undefined;
}

export const clientBootClass = defineTraceEventClass({
  id: "client-boot",
  schema: ClientBootSectionSchema,
  captureAtTrip: captureClientBootSection,
});

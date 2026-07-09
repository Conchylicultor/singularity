import { captureFlightWindow } from "@plugins/infra/plugins/runtime-profiler/core";
import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";
import { FlightWindowSchema } from "../../shared/flight-window";

// The spans class: captured SYNCHRONOUSLY at the trip instant (no enrich, no
// ring) so the open spans + completed ring describe the same coherent instant
// the engine minted the trip at. Persisted under snapshot.events.spans, validated
// by the SAME schema the web parses it back with (../../shared/flight-window).
export const spansClass = defineTraceEventClass({
  id: "spans",
  schema: FlightWindowSchema,
  captureAtTrip: (ctx) => captureFlightWindow({ windowStartMs: ctx.windowStartMs }),
});

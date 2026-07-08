import { z } from "zod";
import {
  captureFlightWindow,
  SPAN_KINDS,
  type FlightWindow,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";

// Zod mirror of the profiler's FlightWindow (open + recently-completed spans).
// The `kind` enum is DERIVED from the recorder's single SPAN_KINDS source, not
// hand-written, so a new span kind can never silently drift out of this schema.
// (A hand-mirrored enum passed tsc — the compile-time guard below only checks
// the schema is assignable TO FlightWindow, so a narrower enum slipped through —
// but rejected `cascade` at runtime. Deriving ends that failure mode.)
const spanKindSchema = z.enum(SPAN_KINDS);

const SpanRefSchema = z.object({
  kind: spanKindSchema,
  label: z.string(),
});

const FlightSpanSchema = z.object({
  kind: spanKindSchema,
  label: z.string(),
  t0: z.number(),
  t1: z.number().nullable(), // null => still open at capture
  ageMs: z.number(),
  parents: z.array(SpanRefSchema),
  waitMs: z.number(),
  childMs: z.number(),
  selfMs: z.number(),
  waits: z.record(z.number()).optional(),
});

const FlightWindowSchema = z.object({
  atMs: z.number(),
  open: z.array(FlightSpanSchema),
  completed: z.array(FlightSpanSchema),
});

// Compile-time guard: the schema must stay assignable to the source FlightWindow.
// If FlightWindow / SpanKind changes and this schema isn't updated to match, the
// assignment fails tsc.
const _assertFlightWindow: FlightWindow = {} as z.infer<typeof FlightWindowSchema>;
void _assertFlightWindow;

// The spans class: captured SYNCHRONOUSLY at the trip instant (no enrich, no
// ring) so the open spans + completed ring describe the same coherent instant
// the engine minted the trip at. Persisted under snapshot.events.spans.
export const spansClass = defineTraceEventClass({
  id: "spans",
  schema: FlightWindowSchema,
  captureAtTrip: (ctx) => captureFlightWindow({ windowStartMs: ctx.windowStartMs }),
});

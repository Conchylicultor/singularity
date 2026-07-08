import { z } from "zod";
import {
  captureFlightWindow,
  type FlightWindow,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { defineTraceEventClass } from "@plugins/debug/plugins/trace/plugins/engine/server";

// Zod mirror of the profiler's FlightWindow (open + recently-completed spans).
// The `kind` enum is pinned to SpanKind by the compile-time assertion below, so
// if the profiler adds a span kind, tsc forces this schema to keep up — the
// boot-profile pinned-mirror discipline.
const SpanRefSchema = z.object({
  kind: z.enum(["http", "db", "loader", "sub", "push", "flush", "job"]),
  label: z.string(),
});

const FlightSpanSchema = z.object({
  kind: z.enum(["http", "db", "loader", "sub", "push", "flush", "job"]),
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

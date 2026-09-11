import { z } from "zod";

// The report kind this plugin files. One literal, read by both the server
// `ReportKind` and the web `Reports.KindView`, so the two can never disagree.
// Persisted report rows key on it — do not rename.
export const SPAN_STUCK_KIND = "span-stuck";

// One open ancestor of the stuck span, as it stood when the watchdog saw it.
const StuckAncestorSchema = z.object({
  id: z.number().int(),
  // A span kind. Stored as a plain string rather than an enum over the
  // profiler's current `SPAN_KINDS`: this is persisted data, and a row written
  // under an older kind set must still parse after the set changes.
  kind: z.string(),
  label: z.string(),
  ageMs: z.number(),
});
export type StuckAncestor = z.infer<typeof StuckAncestorSchema>;

// The jsonb payload of a `span-stuck` report: one operation that was still
// running past its kind's threshold when the watchdog looked.
//
// Filed ONCE per span run (`spanId`), deduped onto one row per operation
// (`kind` + `label`), so a row's `count` reads "how many separate runs of this
// operation got stuck".
export const StuckSpanPayloadSchema = z.object({
  // The runtime profiler's per-run id of the stuck span. Names the exact run in
  // the attached trace's flight window.
  spanId: z.number().int(),
  kind: z.string(),
  label: z.string(),
  // How long it had been running when the watchdog filed it — a lower bound on
  // how long it was stuck, since it is filed once and never re-measured.
  ageMs: z.number(),
  // The threshold for this kind it had crossed.
  thresholdMs: z.number(),
  // The chain of still-open ancestors this span ran inside, OUTERMOST first,
  // ending at its immediate parent. Empty for a top-level span, and cut short
  // where a parent had already closed.
  ancestors: z.array(StuckAncestorSchema),
  // The coherent-instant trace of everything in flight at detection (Debug →
  // Slow Events), or null when the trace engine did not admit one (disabled,
  // or the same trigger inside its cooldown). A state, never a missing field.
  traceId: z.string().nullable(),
});
export type StuckSpanPayload = z.infer<typeof StuckSpanPayloadSchema>;

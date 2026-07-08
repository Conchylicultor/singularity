import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { TraceSchema } from "../core";

// One trace's list-row metadata — NO snapshot blob, so the list stays cheap even
// though a snapshot is tens of KB. Mirrors boot-profile's list contract.
export const TraceListItemSchema = z.object({
  id: z.string(),
  worktree: z.string(),
  triggerKind: z.string(),
  triggerLabel: z.string(),
  durationMs: z.number(),
  thresholdMs: z.number(),
  createdAt: z.string(),
  wallTime: z.string(), // ISO trip anchor (snapshot.wallTime); the interval END.
  windowSpanMs: z.number(), // snapshot.atMs − snapshot.windowStartMs; interval width.
});
export type TraceListItem = z.infer<typeof TraceListItemSchema>;

// List recent traces (metadata only), newest first, hard-capped. Hydrate-on-open
// (no live resource) — trace writes happen exactly when the system is slow, so a
// change-feed push per write would add load at the worst moment (the same reason
// slow_ops is change-feed-excluded); the pane refreshes on demand.
export const listTraces = defineEndpoint({
  route: "GET /api/traces",
  response: z.object({ items: z.array(TraceListItemSchema) }),
  dedupe: true,
});

// Fetch one trace WITH the full snapshot blob for the detail render. 404 when the
// id is unknown or malformed, so the pane renders a graceful not-found.
export const getTrace = defineEndpoint({
  route: "GET /api/traces/:id",
  response: TraceSchema,
});

// Verification endpoint: runs a REAL entry span (so the flight window has
// content), then captures a trace from a synthetic trigger — exercising
// admission → coherent-instant capture → enrich → persist end-to-end from one
// POST. Returns the minted trace id (null when admission rejected it).
export const testTrigger = defineEndpoint({
  route: "POST /api/debug/trace/test-trigger",
  body: z.object({ ms: z.number(), label: z.string().optional() }),
  response: z.object({ ok: z.boolean(), id: z.string().nullable() }),
});

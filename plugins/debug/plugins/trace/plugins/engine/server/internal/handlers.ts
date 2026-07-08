import { eq, desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listTraces, getTrace } from "../../shared/endpoints";
import { _traces } from "./tables";

// The `id` column is a uuid. A non-uuid path param (a hand-typed or stale URL)
// would make `id = '<garbage>'` a Postgres cast error (500), so guard it and
// treat any malformed id as a plain not-found — the same graceful state as an
// unknown-but-valid uuid. The boot-profile pattern.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// List recent traces, metadata only (NO snapshot blob), newest first, hard-capped
// at 200 so the list stays cheap regardless of table size.
export const handleListTraces = implement(listTraces, async () => {
  const rows = await db
    .select({
      id: _traces.id,
      worktree: _traces.worktree,
      triggerKind: _traces.triggerKind,
      triggerLabel: _traces.triggerLabel,
      durationMs: _traces.durationMs,
      thresholdMs: _traces.thresholdMs,
      createdAt: _traces.createdAt,
    })
    .from(_traces)
    .orderBy(desc(_traces.createdAt))
    .limit(200);
  return {
    items: rows.map((r) => ({
      id: r.id,
      worktree: r.worktree,
      triggerKind: r.triggerKind,
      triggerLabel: r.triggerLabel,
      durationMs: r.durationMs,
      thresholdMs: r.thresholdMs,
      createdAt: r.createdAt.toISOString(),
    })),
  };
});

// Fetch one trace WITH the full snapshot blob for the detail render. 404 loudly
// when the id is unknown or malformed so the pane renders a graceful not-found.
export const handleGetTrace = implement(getTrace, async ({ params }) => {
  if (!UUID_RE.test(params.id)) {
    throw new HttpError(404, `Trace "${params.id}" not found`);
  }
  const [row] = await db
    .select()
    .from(_traces)
    .where(eq(_traces.id, params.id))
    .limit(1);
  if (!row) throw new HttpError(404, `Trace "${params.id}" not found`);
  return row;
});

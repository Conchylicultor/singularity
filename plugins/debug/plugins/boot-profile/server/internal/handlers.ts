import { eq, desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  saveBootTrace,
  getSavedBootTrace,
  listBootTraces,
} from "../../shared/endpoints";
import { _bootTraces } from "./tables";

// The `id` column is a uuid. A non-uuid path param (a hand-typed or stale URL)
// would make `id = '<garbage>'` a Postgres cast error (500), so guard it and
// treat any malformed id as a plain not-found — the same graceful state as an
// unknown-but-valid uuid.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Persist the posted snapshot under a generated id, stamping the worktree the
// permalink stays scoped to. Returns the id the client builds the URL from.
export const handleSaveBootTrace = implement(saveBootTrace, async ({ body }) => {
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";
  const [row] = await db
    .insert(_bootTraces)
    .values({ worktree, snapshot: body.snapshot })
    .returning({ id: _bootTraces.id });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "saveBootTrace: insert returned no row");
  return { id: row.id };
});

// Fetch one snapshot (with the full blob) for the detail render. 404 loudly when
// the id is unknown so the pane can render a graceful not-found state.
export const handleGetSavedBootTrace = implement(
  getSavedBootTrace,
  async ({ params }) => {
    if (!UUID_RE.test(params.id)) {
      throw new HttpError(404, `Boot trace "${params.id}" not found`);
    }
    const [row] = await db
      .select()
      .from(_bootTraces)
      .where(eq(_bootTraces.id, params.id))
      .limit(1);
    if (!row) throw new HttpError(404, `Boot trace "${params.id}" not found`);
    return row;
  },
);

// List metadata only (NO snapshot blob) so the browse pane stays cheap, newest
// first.
export const handleListBootTraces = implement(listBootTraces, async () => {
  const rows = await db
    .select({
      id: _bootTraces.id,
      worktree: _bootTraces.worktree,
      createdAt: _bootTraces.createdAt,
    })
    .from(_bootTraces)
    .orderBy(desc(_bootTraces.createdAt));
  return {
    items: rows.map((r) => ({
      id: r.id,
      worktree: r.worktree,
      createdAt: r.createdAt.toISOString(),
    })),
  };
});

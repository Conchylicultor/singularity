import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { BootTraceSchema, SavedBootTraceSchema } from "../core";

// Persist the current in-memory boot trace under a generated id, returning the
// id the "Copy permalink" URL is built from. POST so it never runs from a
// cache/prefetch — a write happens only on an explicit button click.
export const saveBootTrace = defineEndpoint({
  route: "POST /api/boot-traces",
  body: z.object({ snapshot: BootTraceSchema }),
  response: z.object({ id: z.string() }),
});

// Fetch one saved snapshot (with the full blob) for the detail render. 404 when
// the id is unknown.
export const getSavedBootTrace = defineEndpoint({
  route: "GET /api/boot-traces/:id",
  response: SavedBootTraceSchema, // { id, worktree, snapshot, createdAt }
});

// List saved snapshots' metadata (NO snapshot blob) for the browse pane, so
// listing stays cheap. `dedupe` collapses concurrent identical GETs.
export const listBootTraces = defineEndpoint({
  route: "GET /api/boot-traces",
  response: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        worktree: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
  dedupe: true,
});

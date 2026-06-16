# Page Version History + Restore (Notion-style)

> Plan — 2026-06-16. Category: `global` (new top-level `history` plugin + a `page` read-only renderer + a Pages consumer).

## Context

The Pages app has no edit history: there is no way to view or restore a previous
version of a page. Notion keeps per-page version history with restore. We want the
same — but the user's explicit constraint is that the **history mechanism must be a
self-contained, domain-agnostic plugin reusable cross-app**, not pages-specific.

This mirrors the existing precedent already in the repo:
`plugins/search/plugins/engine` is a domain-agnostic substrate and
`plugins/apps/plugins/pages/plugins/content-search` is the per-domain consumer that
indexes pages + contributes the UI. We replicate that split for versioning.

### Confirmed product decisions
- **Versioning:** automatic, **time-bucketed** (one version per ~10-min active-editing window), driven by the push-based `blocksChanged` event → debounced job. No polling.
- **Restore:** **reversible replace** — snapshot the current state first (a distinct "Before restore" undo point), then replace.
- **Retention:** keep all for now; leave a clean seam for a future pruning job.
- **Preview:** **faithful read-only block render** of the snapshot, **with diff highlighting** vs the current page. Professional, polished UI (follow the `theme` + `css` skills and `sidequests/ui-mastery`).

## Architecture overview

Four pieces, three new plugins + one new reusable renderer:

1. **`plugins/history/plugins/engine`** (new, domain-agnostic server substrate) — the `entity_versions` table, a `defineHistorySource` registry, time-bucketed `recordVersion`, a `deleteVersions` helper, and list/get/restore endpoints. Imports no page code. Mirrors `search/engine`.
2. **`plugins/history/plugins/dialog`** (new, reusable web UI) — `useVersionHistory` hook + `<VersionHistoryDialog>` with an injected `renderPreview(versionId)` prop. Mirrors `search/quick-find` (separate from the engine so non-UI consumers don't pull React).
3. **`plugins/page/plugins/read-only-view`** (new, reusable page primitive) — a `<ReadOnlyBlocks>` faithful static renderer for a block forest + a `RunsRenderer` (rich-text runs → React). Reusable beyond history (Story lenses are incomplete today precisely because this didn't exist). Accepts optional per-block diff tags for highlight styling.
4. **`plugins/apps/plugins/pages/plugins/history`** (new, the Pages consumer) — registers the page history source (serialize/restore), binds the debounced snapshot job to `blocksChanged`, cleans up on page delete, and contributes the "Version history" header button + the diffed preview. Mirrors `content-search`.

```
edit a page → notifyBlockChange() → blocksChanged.emit({pageId})
   → [Trigger] pageHistoryScheduleJob   (event-bound, dedup:"none")
       → pageSnapshotJob.enqueue({pageId}, {runAt: now+4s})   (dedup:{key:pageId})
           graphile job_key=replace ⇒ burst collapses to ONE run 4s after last edit
       → recordVersion("pages", pageId)
           ⇒ 10-min window: overwrite newest version, else insert new
```

---

## 1. `plugins/history/plugins/engine` (server, domain-agnostic)

### Table — `core`/`server/internal/tables.ts`
New table `entity_versions` (NOT `defineExtension` — that is 1:1 per entity; versioning is 1:N):

```ts
export const _entityVersions = pgTable("entity_versions", {
  id:        text("id").primaryKey(),            // uuid
  sourceId:  text("source_id").notNull(),        // e.g. "pages"
  entityId:  text("entity_id").notNull(),        // e.g. the page block id
  snapshot:  jsonb("snapshot").notNull(),        // OPAQUE per-source payload
  label:     text("label"),                      // optional human label from serialize()
  author:    text("author"),                     // optional attribution (null for now)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("entity_versions_source_entity_created_idx").on(t.sourceId, t.entityId, t.createdAt),
]);
```
- **No FK** to `page_blocks` — engine must stay domain-agnostic. Orphan cleanup is the consumer's job via `deleteVersions` (see §4). The `(sourceId, entityId, createdAt)` index is the seam for a future age/count pruning job.

### Schemas — `core/schemas.ts`
```ts
export const VersionSchema = z.object({          // list metadata (no snapshot blob)
  id: z.string(), sourceId: z.string(), entityId: z.string(),
  label: z.string().nullable(), author: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type Version = z.infer<typeof VersionSchema>;
```
Snapshot stays `z.unknown()` to the engine.

### Source registry (collection pattern) — `server/internal/registry.ts`
```ts
export interface HistorySource {
  id: string;
  serialize: (entityId: string) => Promise<{ snapshot: unknown; label?: string; author?: string }>;
  restore:   (entityId: string, snapshot: unknown) => Promise<void>;
}
export function defineHistorySource(source: HistorySource): Registration; // registers into a Map, mirrors defineJob/defineResource Registration shape so it sits in `register: [...]`
export function getHistorySource(id: string): HistorySource | undefined;
```
Engine never imports a source; sources register themselves. (No consumer is named by the engine — collection-consumer separation.)

### `recordVersion` with bucket coalescing — `server/internal/record-version.ts`
```ts
const WINDOW_MS = 10 * 60 * 1000;
export async function recordVersion(sourceId: string, entityId: string, opts?: { force?: boolean; label?: string }): Promise<void> {
  const source = getHistorySource(sourceId);
  if (!source) return;                                   // self-heal stale binding
  const { snapshot, label, author } = await source.serialize(entityId);
  const finalLabel = opts?.label ?? label ?? null;
  const [newest] = await db.select().from(_entityVersions)
    .where(and(eq(_entityVersions.sourceId, sourceId), eq(_entityVersions.entityId, entityId)))
    .orderBy(desc(_entityVersions.createdAt)).limit(1);
  const now = new Date();
  if (!opts?.force && newest && now.getTime() - newest.createdAt.getTime() < WINDOW_MS) {
    await db.update(_entityVersions)                     // coalesce within the editing window
      .set({ snapshot, label: finalLabel, author: author ?? null, createdAt: now })
      .where(eq(_entityVersions.id, newest.id));
  } else {
    await db.insert(_entityVersions).values({ id: crypto.randomUUID(), sourceId, entityId, snapshot, label: finalLabel, author: author ?? null, createdAt: now });
  }
}
```
- On coalesce we **bump `createdAt`** (sliding window): a long editing session yields one version timestamped at the last edit.
- `force:true` bypasses the window — used for the pre-restore safety snapshot so it survives as a distinct undo point.

### `deleteVersions` helper — `server/internal/record-version.ts`
Mirrors search's `deleteSource`/`deleteSearchDocs` so consumers never touch the engine table directly:
```ts
export async function deleteVersions(sourceId: string, entityIds: string[]): Promise<void>;
```

### Endpoints — `core/endpoints.ts`
```ts
listVersions    = GET  /api/history/:sourceId/:entityId/versions            → Version[]  (metadata only)
getVersion      = GET  /api/history/:sourceId/:entityId/versions/:versionId → Version & { snapshot: unknown }
restoreVersion  = POST /api/history/:sourceId/:entityId/versions/:versionId/restore → { ok: true }
```

### `handleRestoreVersion` — reversible replace
```ts
const source = getHistorySource(params.sourceId); if (!source) throw new HttpError(404);
await recordVersion(params.sourceId, params.entityId, { force: true, label: "Before restore" }); // undo point
const [v] = await db.select()...where(id = versionId); if (!v) throw 404;
await source.restore(params.entityId, v.snapshot);
```

### Barrel — `server/index.ts`
Exports `defineHistorySource`, `recordVersion`, `deleteVersions`. Registers the 3 endpoints. Imports only `database`, `infra/endpoints`, own internals. **Never imports `page/*`.**

---

## 2. `plugins/history/plugins/dialog` (web, reusable)

### `web/internal/use-version-history.ts`
```ts
export function useVersionHistory(sourceId: string, entityId: string, opts?: { enabled?: boolean }) {
  return useEndpoint(listVersions, { params: { sourceId, entityId } }, { enabled: opts?.enabled });
}
```
Plain query (mirrors `useSearch`). Refetch on dialog open; invalidate after restore. (A live push resource is overkill; documented as an optional upgrade.)

### `web/components/version-history-dialog.tsx`
```ts
export interface VersionHistoryDialogProps {
  open: boolean; onOpenChange: (o: boolean) => void;
  sourceId: string; entityId: string;
  renderPreview: (version: Version) => ReactNode;   // consumer renders its own snapshot shape
}
```
- Layout mirrors `QuickFindDialog`: a left timeline column (`ScrollArea` of `Row`s — relative time via the `relative-time` primitive, optional author, active highlight) and a right preview pane = `renderPreview(activeVersion)`.
- A **Restore** button per row → confirmation (ui-kit AlertDialog, copy notes reversibility: "Your current page is saved before restoring") → `useEndpointMutation(restoreVersion)` → on success invalidate the list + toast.
- Polished: use `Surface`, `Stack`/`Inset` spacing primitives, `Text` variants, semantic tokens only (no ad-hoc color/spacing/radius). Follow `theme` + `css` skills.

### `web/index.ts`
Exports `useVersionHistory`, `VersionHistoryDialog`, `VersionHistoryDialogProps`. No page imports.

---

## 3. `plugins/page/plugins/read-only-view` (web, reusable page primitive)

The faithful renderer. Existing per-type text renderers (`BlockTextRenderer` → `BlockTextEditor`) mount a full Lexical composer and require the live `BlockEditorProvider`/mutation contexts — **not reusable read-only**. So we build a small static renderer that reuses the *metadata* + the simple runs model instead.

### `web/components/runs-renderer.tsx` — `RunsRenderer`
Maps `RichText` (`TextRun[]`) → React, faithfully: per run apply `marks` (bold→`<strong>`, italic→`<em>`, underline/strikethrough→class, code→`<code>`), `color` (→ `var(--rt-color-<token>)`), `link` (→`<a>`). Reuses `runsOf`/`plainOf` from `@plugins/page/plugins/editor/core`. Inline `[[pageId]]` page-link tokens render as a non-editable link chip; `\(latex\)` rendered via the existing KaTeX path if cheap, else plain.

### `web/components/read-only-blocks.tsx` — `<ReadOnlyBlocks>`
```ts
export interface ReadOnlyBlocksProps {
  forest: SerializedBlock[];                 // or richer rows; see §4 snapshot shape
  diff?: Map<string, "added" | "removed" | "modified">;  // optional per-block tags by id
}
```
- Recursively renders the forest. Dispatches on `block.type` using the **handle metadata** from `Editor.Block.useContributions()` (`textVariant`, `marker`, `ordinalMarker`, `toggle`, `collapsible`):
  - **Text-like blocks** (text, heading-1/2/3, bulleted/numbered list, to-do, toggle, quote, callout): render the structural chrome (heading size via `Text` variant, bullet/ordinal marker, to-do checkbox via `selection-indicator`, callout tint) + `RunsRenderer` for the text. This is the dominant case and is fully faithful.
  - **Self-contained media blocks** (image, code-block, divider): reuse the existing "filled" presentation where it doesn't need the editor API (e.g. `<img>`, shiki underlay, `<hr>`). Where a component hard-requires `BlockEditorAPI`, render a minimal faithful equivalent.
  - **Exotic blocks** (embed, equation, bookmark, audio/video/file): render a clean labeled placeholder card (handle `label` + icon) — professional, not broken. Documented as the known fidelity gap.
- When `diff` tag present for a block id, apply a subtle highlight via **semantic tokens** (added → success-tinted left border + bg; removed → muted/strikethrough; modified → accent border). Removed blocks are rendered inline so the diff reads top-to-bottom.

### `web/index.ts`
Exports `ReadOnlyBlocks`, `RunsRenderer`. Lives under `page/` so Story lenses + future export/print/hover-card can adopt it.

> Scope note: the faithful renderer is the largest/riskiest piece. Text-bearing blocks (the bulk of page content) are fully faithful; media/exotic blocks degrade gracefully. This is an explicit, documented tradeoff — not silent truncation.

---

## 4. `plugins/apps/plugins/pages/plugins/history` (the Pages consumer)

### Snapshot shape (pages-owned, stored in `entity_versions.snapshot`)
```ts
interface PageSnapshot {
  page: PageData;            // { title, icon, iconSvgNodes, cover } from the type="page" block
  blocks: StoredBlock[];     // flat rows WITH ids: { id, parentId, type, data, rank, expanded }
}
```
We store **flat rows with ids** (not id-stripped `SerializedBlock`) so the diff can match blocks by stable id (text edits keep the same id; only structural splits mint new ids). Build the tree for both rendering and restore.

### `server/internal/page-source.ts` — register the source
```ts
export const pageHistorySource = defineHistorySource({
  id: "pages",
  serialize: async (pageId) => {
    const [pageBlock] = await db.select().from(_blocks).where(and(eq(_blocks.id, pageId), eq(_blocks.type, PAGE_BLOCK_TYPE)));
    if (!pageBlock) throw ...;                          // page gone
    const rows = await loadPageBlocks(pageId);          // all content rows
    const data = pageData(pageBlock);
    return { snapshot: { page: data, blocks: rows.map(toStoredBlock) }, label: data.title || "Untitled" };
  },
  restore: async (pageId, snapUnknown) => {
    const snap = snapUnknown as PageSnapshot;
    const forest = buildForestFromRows(snap.blocks, pageId);   // rows → SerializedBlock[] (reuse serializeSubtree shape)
    await db.transaction(async (tx) => {
      await tx.delete(_blocks).where(eq(_blocks.pageId, pageId));            // wipe current content
      await tx.update(_blocks).set({ data: snap.page, updatedAt: new Date() }).where(eq(_blocks.id, pageId)); // page data
      const rootRanks = nextRanks(snap.forest.length);
      await insertForest(tx, { pageId, parentId: pageId, rootRanks, forest });
    });
    await notifyBlockChange({ pageId, type: PAGE_BLOCK_TYPE, blockId: pageId });   // post-commit push
  },
});
```
- Reuses trusted helpers `loadPageBlocks`, `insertForest`, `notifyBlockChange`, `pageData`/`PAGE_BLOCK_TYPE` from `@plugins/page/plugins/editor/server` + `/core`.
- Restore goes delete + `insertForest` (fresh ids — matches paste/duplicate precedent; robust). No infinite loop: `recordVersion` never notifies; the post-restore `blocksChanged` re-snapshot coalesces into the window.

### `server/internal/snapshot-job.ts` + scheduler — debounced snapshot
Two jobs (the events dispatcher cannot pass `runAt`, so a thin event-bound scheduler does the delayed re-enqueue):
```ts
export const pageSnapshotJob = defineJob({
  name: "pages.history.snapshot",
  input: z.object({ pageId: z.string() }),
  event: z.never(),
  dedup: { key: ({ pageId }) => pageId },          // graphile job_key=replace ⇒ burst collapses
  run: async ({ input }) => { await recordVersion("pages", input.pageId); },
});

const DEBOUNCE_MS = 4000;
export const pageHistoryScheduleJob = defineJob({
  name: "pages.history.schedule",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await pageSnapshotJob.enqueue({ pageId: event.pageId }, { runAt: new Date(Date.now() + DEBOUNCE_MS) });
  },
});
```
Two-stage, fully push-based coalescing: edit burst → many `blocksChanged` → scheduler re-enqueues the keyed snapshot job with a fresh `runAt+4s` (graphile replaces the pending row) → fires once ~4s after the last edit → `recordVersion`'s 10-min window does the Notion-style bucketing.

### `server/internal/delete-hook.ts`
Mirror `deletePagesSearchHook`: on page-block `BlockLifecycle.BeforeDelete`, call `deleteVersions("pages", [pageId])`. Decision: drop history on page delete (no orphans), consistent with search.

### `server/index.ts`
```ts
register: [pageHistorySource, pageSnapshotJob, pageHistoryScheduleJob],
contributions: [
  Trigger({ on: blocksChanged, do: pageHistoryScheduleJob, with: {}, oneShot: false }),
  BlockLifecycle.BeforeDelete(deletePageHistoryHook),
],
```

### `web/components/version-history-action.tsx` (mirror `StarHeaderAction`)
`IconButton` (`MdHistory`) in `PageDetail.HeaderActions` → opens `<VersionHistoryDialog sourceId="pages" entityId={pageId} renderPreview={...}/>`.

### `web/components/page-version-preview.tsx` — diffed preview
- `useEndpoint(getVersion, ...)` → `PageSnapshot`; also read the **current** page blocks (`useResource(blocksResource, {pageId})`).
- Compute a block-level diff: match version vs current **by id** (fallback: match remaining unmatched by `type`+`textOf`). Tag each block `added` / `removed` / `modified` / unchanged → build the `diff` Map.
- Render header (title/icon from `snap.page`) + `<ReadOnlyBlocks forest={versionForest} diff={diffMap} />`. Clean, professional diff styling via semantic tokens.

### `web/index.ts`
Contributes `PageDetail.HeaderActions({ id: "history", component: VersionHistoryAction })`.

---

## 5. Migration
`entity_versions` is a new table → generated by `./singularity build` (never manual `drizzle-kit`). The consumer + read-only-view own no tables. Build also regenerates the plugin-doc/registry codegen.

## 6. Edge cases & decisions
- **500ms text autosave vs snapshot:** the 4s job debounce sits downstream of the autosave flush → snapshot always reads committed rows. No coordination needed.
- **Restore while editing:** restore is a txn delete+reinsert; `blocksLiveResource` notify post-commit re-hydrates open editors. A mid-restore client op may 404 on a deleted id — the optimistic-mutation layer already handles `OpNoLongerApplies`. Acceptable.
- **Empty page:** serialize `{page, blocks: []}`; restore deletes content, inserts nothing. Valid.
- **Author attribution:** snapshot jobs run in a worker with no HTTP actor context, so "who edited" isn't available at snapshot time → ship `author: null` with the column as a clean seam. (Surface to the user as a follow-up rather than guessing.)
- **Diff after restore:** restore mints fresh ids, so an immediate diff of the "Before restore" snapshot vs current would over-report changes by id alone — the content-based fallback match mitigates this.

## 7. Verification
1. `./singularity build` — confirm green, the `entity_versions` migration generates + applies.
2. Open `http://<worktree>.localhost:9000` → Pages → create a page, type a title + a few blocks (text, heading, to-do, bullet). Wait >4s.
3. `mcp__singularity__query_db`: `SELECT id, source_id, entity_id, label, created_at FROM entity_versions WHERE source_id='pages' ORDER BY created_at DESC` → exactly **one** row after a burst (coalescing works, not per-keystroke).
4. Edit again within 10 min → same row's `created_at`/snapshot updated (window coalesce). (Temporarily lower `WINDOW_MS` to test a second bucket → second row.)
5. Header **Version history** button → dialog lists versions w/ relative time; preview renders the snapshot faithfully; diff highlights added/removed/modified blocks vs current.
6. Restore an older version → query_db shows a new "Before restore" row; page reverts live in the editor; restoring *that* row returns to latest (reversibility).
7. Delete the page → `SELECT count(*) ... WHERE entity_id='<pageId>'` = 0 (delete hook).
8. Debug → queue surface: `pages.history.snapshot` shows one coalesced run per burst, not N.

## Critical files to reuse (do not reinvent)
- `plugins/page/plugins/editor/server/internal/forest.ts` — `loadPageBlocks`, `serializeSubtree`, `insertForest`.
- `plugins/page/plugins/editor/server/internal/notify.ts` — `notifyBlockChange`.
- `plugins/page/plugins/editor/server/internal/tables-events.ts` — `blocksChanged`; `document-hooks.ts` — `BlockLifecycle.BeforeDelete`.
- `plugins/page/plugins/editor/core` — `runsOf`/`plainOf`/`textOf`, `PAGE_BLOCK_TYPE`, `pageData`, `SerializedBlock`, `Editor.Block` handle metadata.
- `plugins/infra/plugins/jobs/server/internal/registry.ts` — `defineJob` `dedup:{key}` + `enqueue(..., {runAt})` debounce.
- `plugins/apps/plugins/pages/plugins/content-search/server/index.ts` — Trigger-on-`blocksChanged` + `BeforeDelete` precedent.
- `plugins/search/plugins/engine/server/internal/index-api.ts` — domain-agnostic engine API shape.
- `plugins/search/plugins/quick-find/web/components/quick-find-dialog.tsx` — reusable dialog w/ injected callbacks (template for `VersionHistoryDialog`).
- `plugins/apps/plugins/pages/plugins/starred/.../star-header-action.tsx` — `PageDetail.HeaderActions` contribution shape.

## Open follow-ups (not blocking)
- Author attribution (needs a server-side actor identity primitive — surface to fix structurally, not workaround).
- Retention pruning job (age/count) — table + index already support it.
- Story lenses adopting `ReadOnlyBlocks` to fix their incomplete rendering.

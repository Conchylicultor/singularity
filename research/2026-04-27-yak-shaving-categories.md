# Yak-shaving categories

## Context

Today the yak-shaving tree clusters conversations only via parent-conversation edges (sequencing or convergence). The Sonnet curator can group conversations as siblings under a "foundational" conversation, but there is no first-class way to express "these are organizationally related" without a real blocking/convergence relationship — and many useful clusters (e.g. "Plugin refactors", "UI polish", "Tooling/dev-loop") have no natural conversation root.

We're adding **category nodes** — header + description rows that exist purely to cluster other nodes. After this change, every yak-shaving conversation node has either:

- a parent **conversation node** (today's behavior — sequencing/convergence), or
- a parent **category node** (new — pure organization), or
- no parent (root).

Categories nest freely under other categories, but cannot be children of conversation nodes (categories are an organizational layer above the content layer). The Sonnet curator gains three MCP tools (`yak_add_category` / `yak_update_category` / `yak_remove_category`) and updated prompt guidance so it produces categories as part of the rebuild.

## Design decisions (already settled)

- **Separate `_yak_shaving_categories` table** rather than single-table polymorphism. Categories and conversation-nodes have disjoint columns; keeping them apart avoids null-soup and lets each table evolve independently.
- **Two nullable FK columns on `_yak_shaving_nodes`** — `parentNodeId` (existing) and `parentCategoryId` (new), mutually exclusive — rather than `(parentKind, parentId)`. Additive migration, no rename of existing column, drizzle relations stay clean. Mutual exclusivity enforced in MCP-tool code (these are soft FKs already).
- **Categories nest freely** — `_yak_shaving_categories.parentCategoryId` is a self-FK. Cycle prevention applies. No conversation-node parent allowed.

## Schema changes

`plugins/yak-shaving/server/internal/tables.ts` — add new column + new table:

```ts
export const _yakShavingNodes = pgTable(
  "yak_shaving_nodes",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    parentNodeId: text("parent_node_id"),          // existing — conversation parent
    parentCategoryId: text("parent_category_id"),  // NEW — category parent (mutually exclusive with parentNodeId)
    oneLineContext: text("one_line_context"),
    nextAction: text("next_action"),
    status: text("status"),
    rank: rankText("rank"),
    createdAt: ...,
    updatedAt: ...,
  },
  (t) => [
    uniqueIndex("yak_shaving_nodes_conv_idx").on(t.conversationId),
    index("yak_shaving_nodes_parent_idx").on(t.parentNodeId),
    index("yak_shaving_nodes_parent_cat_idx").on(t.parentCategoryId),
  ],
);

export const _yakShavingCategories = pgTable(
  "yak_shaving_categories",
  {
    id: text("id").primaryKey(),                       // `cat-${ts}-${rand}`
    parentCategoryId: text("parent_category_id"),      // self-FK, soft
    title: text("title").notNull(),                    // short header (≤100 chars)
    description: text("description").notNull(),        // one-line description (≤300 chars)
    rank: rankText("rank"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("yak_shaving_categories_parent_idx").on(t.parentCategoryId),
  ],
);
```

Drizzle generates the migration during `./singularity build`; commit it.

`plugins/yak-shaving/server/internal/schema.ts` — add `YakShavingCategorySchema` mirroring the existing pattern.

## Server changes

### Resources (`server/internal/resources.ts`)

Keep `yakShavingNodesResource` (now also returns `parentCategoryId`). Add a parallel resource:

```ts
export const yakShavingCategoriesResource = defineResource({
  key: "yak-shaving-categories",
  mode: "push",
  loader: async (): Promise<YakShavingCategory[]> =>
    db.select().from(_yakShavingCategories)
      .orderBy(asc(_yakShavingCategories.rank), asc(_yakShavingCategories.createdAt)),
});
```

Export the descriptor from `shared/resources.ts` for the web client.

### MCP tools (`server/internal/mcp-tools.ts`)

**Extend the two existing add/update node tools** to accept a category parent. Use a discriminated parent ref so the model's intent is explicit and we keep cycle/validation logic isolated:

```ts
const NodeParentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("conversation"), conversationId: z.string().min(1) }),
  z.object({ kind: z.literal("category"), categoryId: z.string().min(1) }),
]).nullable();
```

- `yak_add_node` — replace `parentConversationId` with `parent: NodeParentSchema`. On `kind: "category"`, verify the category exists, set `parentCategoryId` (and leave `parentNodeId` null). On `null`, both null. `nextRankUnder` needs to be parameterized over either `(parentNodeId | parentCategoryId | null)` — extend to take a discriminated key.
- `yak_update_node` — same extension on `parent`. When reparenting, clear the *other* parent column. Cycle check `isParentSafe` is unchanged for conversation parents; categories don't form cycles with nodes (different table) so no extra check needed there beyond "category exists".
- `yak_remove_node` — unchanged.

**Three new tools** (mirror the node tools' shape):

- `yak_add_category({ parentCategoryId: string | null, title, description })` → returns `{ ok: true, category_id }`.
  - Validate: category doesn't already exist with same id (we mint id, so trivially true), parent (if provided) exists, parent chain is acyclic (reuse a category-flavored `isCategoryParentSafe`).
- `yak_update_category({ categoryId, title?, description?, parentCategoryId? })`
  - At least one of the optional fields required.
  - Cycle check on reparent.
  - Self-parenting forbidden.
- `yak_remove_category({ categoryId })`
  - **Leaf-first** semantics, but across two relationships: fail if any node has `parentCategoryId === categoryId` OR any other category has `parentCategoryId === categoryId`. The error message lists what's blocking removal so the model knows what to clear first.

Each mutation calls `yakShavingCategoriesResource.notify()` (and `yakShavingNodesResource.notify()` if it touched node rows — none of these do, but reparenting nodes via update does).

`newCategoryId()` returns `cat-${Date.now()}-${rand}` to keep IDs disjoint from `yak-` node IDs (helpful for debugging, not load-bearing).

### Prompt updates (`server/internal/queries.ts`)

Two changes to `PROMPT_INSTRUCTIONS`:

1. **New "When to create a category" section.** After the existing "what makes a child" block, add guidance like:
   - *Categories cluster conversations that share a theme but aren't sequencing-related.* Use a category when ≥3 active conversations share a theme that the dependency rules above wouldn't cluster (e.g. "Plugin polish", "Tooling/dev-loop", "Bug investigations").
   - *Don't create a category for a single conversation.* Don't use a category as a workaround for sequencing — if there's a real blocking relationship, use a conversation parent instead.
   - *Categories nest categories.* `parentCategoryId` may point to another category. Convention: at most 2 levels deep unless the user clearly has a deeper organization.
   - *Categories never have conversation-node parents.* They sit above content.
   - *Conversations choose one parent kind.* A conversation node has a category parent OR a conversation parent OR null — never both.

2. **Updated reconciliation procedure.** Extend the existing "Reconcile by:" list with category steps:
   - Examine `<previous-categories>` (new section) and `<active-conversations>`. Add categories first (roots before children) via `yak_add_category`.
   - For each conversation in `<active-conversations>`, call `yak_add_node` with one of: `parent: null`, `parent: { kind: "conversation", conversationId }`, or `parent: { kind: "category", categoryId }`.
   - Remove unused categories last (after their children are reparented or removed) via `yak_remove_category`.

3. **Payload structure** (`buildRebuildPayload`):
   - Add a `<categories>` (or fold into `<previous-tree>`) section listing existing categories with their nesting, e.g.
     ```xml
     <categories>
       <category id="cat-..." title="Plugin refactors" description="...">
         <category id="cat-..." title="UI polish" description="..." />
       </category>
     </categories>
     ```
   - In `<previous-tree>`, render the unified tree: top-level entries are root categories *and* root conversation-nodes, interleaved. Each conversation node renders with a `parentCategoryId` or `parentNodeId` attribute when applicable, so the model can verify state.
   - `<stale-nodes>` only for conversation nodes (categories have no conversation tie). Add a parallel `<unused-categories>` section if helpful — **defer**: the model can already see the full category list and decide.

`formatPreviousTree` becomes a unified walk over both kinds. Sketch:
- Build `categoriesById`, `nodesById`.
- `childCategoriesOf[parentCategoryId]`, `childNodesOf[parentCategoryId]`, `childNodesOf[parentNodeId]`.
- Recurse: from null root, emit root categories + root nodes (sorted by rank). Each category emits its child categories + child nodes. Each node emits its child nodes (no category children).

## Web changes

### Resource & shared types (`shared/resources.ts`)

Export `yakShavingCategoriesResource` descriptor and `YakShavingCategory` type alongside the existing node export.

### Tree assembly (`web/components/yak-tree.tsx`)

Read both resources, merge into a single `TreeItem[]` keyed by id. The `buildTree` utility from `@plugins/primitives/plugins/tree/shared` already accepts `{ id, parentId }` items — we just need to compute `parentId` per kind:

```ts
type YakTreeItem =
  | (YakShavingCategory & { kind: "category"; parentId: string | null; rank: string })
  | (YakShavingNode     & { kind: "conversation"; parentId: string | null; rank: string });

const items: YakTreeItem[] = [
  ...categories.map((c) => ({ ...c, kind: "category" as const, parentId: c.parentCategoryId, rank: c.rank ?? "" })),
  ...nodes.map((n) => ({ ...n, kind: "conversation" as const, parentId: n.parentCategoryId ?? n.parentNodeId, rank: n.rank ?? "" })),
];
```

Category and conversation IDs are disjoint (different prefixes), so a single tree built from this list is unambiguous.

### Row rendering (`web/components/yak-tree-row.tsx`)

Discriminate on `node.kind`:

- `kind === "category"` → render a header row: bold title, gray description below, no status dot, no click-through (or a quiet expand/collapse later — defer). Slight visual differentiation: small folder/section icon and possibly a faint divider above.
- `kind === "conversation"` → existing rendering, unchanged.

Recurse into `node.children` regardless of kind.

### Pane behavior

Clicking a conversation row continues to open `yakShavingConversationPane`. Clicking a category does nothing for v1 (or toggles a "fold this category" state stored in component state — defer).

## What we're explicitly *not* doing in v1

- No collapsible/foldable categories in the UI (defer until we see if it's needed).
- No drag-and-drop reorganization (categories edited only by the curator).
- No category-only "view" — categories live in the unified tree.
- No `<unused-categories>` payload section — the model sees the full category list and can choose to remove unused ones.
- No constraint that a category must contain ≥2 children — left to the prompt.

## Critical files to modify

- `plugins/yak-shaving/server/internal/tables.ts` — add `parentCategoryId` column + `_yakShavingCategories` table.
- `plugins/yak-shaving/server/internal/schema.ts` — add `YakShavingCategorySchema` + type.
- `plugins/yak-shaving/server/internal/resources.ts` — add `yakShavingCategoriesResource`.
- `plugins/yak-shaving/server/internal/mcp-tools.ts` — extend `yak_add_node`/`yak_update_node` parent shape; add three category tools; parameterize `nextRankUnder`.
- `plugins/yak-shaving/server/internal/queries.ts` — update `PROMPT_INSTRUCTIONS`; rewrite `formatPreviousTree` to be category-aware.
- `plugins/yak-shaving/server/index.ts` — re-export new types/resource.
- `plugins/yak-shaving/shared/resources.ts` — export `yakShavingCategoriesResource` descriptor + type.
- `plugins/yak-shaving/web/components/yak-tree.tsx` — read both resources, merge into items list.
- `plugins/yak-shaving/web/components/yak-tree-row.tsx` — discriminate on `kind`, render category rows.
- `plugins/yak-shaving/web/index.ts` — no change unless we expose new components.
- `docs/plugins.md` — update yak-shaving exports/schemas list (kept in sync by `plugins-doc-in-sync` check).

## Verification

1. **Build & migration generated.** From this worktree:
   ```bash
   ./singularity build
   ```
   Confirm a new migration appears under `server/src/db/migrations/` adding `parent_category_id` column and the `yak_shaving_categories` table; commit it.

2. **Open the worktree app** at `http://<worktree>.localhost:9000/yak`. Tree renders empty or with existing nodes — no regression.

3. **Manual MCP smoke test.** Trigger a rebuild:
   ```bash
   curl -XPOST http://<worktree>.localhost:9000/api/yak/rebuild
   ```
   Open the system conversation that's spawned (or watch the JSONL viewer) and verify Sonnet emits at least one `yak_add_category` call before placing nodes when the active set has clearly thematic clusters. Then verify the resulting tree in the UI shows the category as a header row with title + description, and conversations grouped under it.

4. **Mutual-exclusivity check.** From a one-off REPL or a dummy MCP client, call `yak_add_node` with a conversation parent, then `yak_update_node` to move it under a category. Verify `parentNodeId` is cleared and `parentCategoryId` is set. Then move it back: verify the inverse.

5. **Leaf-first deletion.** Try `yak_remove_category` on a category that still contains nodes — expect an error listing the blocking children. Remove/reparent the children, retry — expect success.

6. **Cycle prevention.** Try `yak_update_category` to set its own `parentCategoryId` to itself or to a descendant — expect an error.

7. **Plugin doc sync.** Run `./singularity check --plugins-doc-in-sync` and update `docs/plugins.md` if the check fails.

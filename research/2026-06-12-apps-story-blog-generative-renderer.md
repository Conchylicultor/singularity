# Story Builder — Blog renderer + the generative-lens substrate

> Companion to [`2026-06-03-app-story-builder-plan-v2.md`](./2026-06-03-app-story-builder-plan-v2.md).
> Supersedes that plan's "Renderers → Blog" section (the pure-display framing)
> after a scope reframe: **lenses are AI-generated from the outline, not literal
> re-displays of it.**

## Context

Story Builder lets you author a page as a **block-tree outline** and view it
through pluggable renderers (lenses). The first lens, **Slides**, landed as a
*display* renderer (lays existing blocks out as a deck).

The reframe: the end goal is that lenses like Blog and Slides are **AI-generated
from the outline**. The block tree is an *outline* — structure + idea bullets. A
renderer **generates the finished artifact** (a blog article, a deck) whose
structure follows the tree and whose prose fleshes out the bullets. "Tree depth →
heading levels" describes how the outline shapes the *generated* article, not a
restyling of source blocks. Generation is **on-demand and persisted**.

**Blog is the first generative lens.** This doc plans the *global substrate* so
the following all become cheap additive extensions later — and bakes their
structural seams in now (they are expensive to retrofit) **without implementing
them in this task**:

- **Sub-unit generation** — regenerate one slide / one section, not just the whole
  artifact.
- **Feedback iteration** — a feedback form to revise generated content in place.
- **Separable theme/presentation** — change the visual theme of a deck/article
  without regenerating its content.

## Design spine: three orthogonal axes

The whole architecture follows from keeping these three independent:

| Axis | What | Where it lives | Changes trigger |
|------|------|----------------|-----------------|
| **A. Outline** | authored structure + idea bullets | `page_blocks` (existing editor) | — |
| **B. Content** | LLM-generated artifact, **per unit**, revisable | `story_generated_units` (new) | outline edit → unit *stale*; feedback → revise |
| **C. Presentation** | theme/skin applied at render time | story config (`marker`) + existing theme system | theme pick → re-render, **no regeneration** |

The two hard rules that make the future features trivial:

1. **Content is addressable per *unit*** (a section / a slide), never one opaque
   blob — so per-unit regeneration and per-unit staleness are free.
2. **Content is semantic, presentation is separate** — the LLM emits *semantic*
   content (clean Markdown, or `{title, bullets}` per slide), never pre-styled
   markup. Theme is a render-time choice over the same stored content.

## Architecture (layered DAG)

```
story-core (core)        outline IR + hashOutline(subtree) + outlineToBullets()    ← leaf, pure
   ▲                                                                ▲
generation (core/shared/server/web)   GENERIC engine: generate+persist content keyed by
   │   (pageId, kind, unitId) with per-unit inputHash + status + optional feedback;
   │   useGeneratedUnits()                                          ▲ consumed by
render (web)             Story.Renderer/Content slots (+ thread pageId into props)
   ▲                                                                ▲
renderers/blog (web)     segment(outline)→units · buildBlogPrompt(unit) · <Markdown> view
                         contributes Story.Renderer "blog"
```

`generation` is format-agnostic (stores opaque per-unit text). Each renderer owns:
how the outline **segments into units**, the **prompt** per unit, and the
**presentation** of stored content. Clean collection-consumer separation.

## The generative-lens primitive — `apps/plugins/story/plugins/generation`

A reusable "generated content" substrate. **Home it under Story for now** (single
consumer; avoid premature `infra/` generalization), designed format-agnostic so it
graduates to `infra/generated-artifact` at the second consumer.

### Data model — one row per (page, kind, **unit**)

Unit-addressable from day one — this is the seam that makes sub-unit regeneration
additive. Standalone `pgTable` (mirror `claude-cli/server/internal/tables.ts`):

```ts
// generation/server/internal/tables.ts
export const _storyGeneratedUnits = pgTable("story_generated_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: text("page_id").notNull(),
  kind: text("kind").notNull(),            // rendererId, e.g. "blog"
  unitId: text("unit_id").notNull(),       // renderer-derived stable id; "article" for blog v1,
                                           //   the slide/section node-id when segmented later
  inputHash: text("input_hash").notNull(), // hashOutline(unit subtree) at generation time
  status: text("status").$type<GenStatus>().notNull(), // "generating"|"ready"|"error"
  output: text("output"),                  // SEMANTIC content (markdown / json); null until ready
  prompt: text("prompt"),                  // fully-assembled model input for the latest turn (debug)
  instruction: text("instruction"),        // human directive for the latest turn (null = fresh, no guidance)
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("story_generated_units_pk_idx").on(t.pageId, t.kind, t.unitId)]);
```

Whole-artifact = all rows for (pageId, kind). Blog v1 writes **one** unit
(`unitId:"article"`); per-section Blog and per-slide Slides later write many — no
schema change. A future `story_generation_revisions` log (feedback history) is a
pure add; the `feedback` column covers v1.

### Server flow (durable, push-based)

- **Endpoint** `generateUnit` — `POST /api/story/generate/:pageId/:kind/:unitId`,
  body is a **turn** `{ prompt: string; inputHash: string; instruction?: string }`.
  Handler upserts the row (status `"generating"`, store
  `inputHash`/`prompt`/`instruction`), `.notify()`s the resource, enqueues the job.
- **Job** `story-generation.generate` (`defineJob`), `dedup:{ key:(i) =>
  ${i.pageId}:${i.kind}:${i.unitId} }`. `run`: `runClaudePrint({ tier:"sonnet",
  prompt, timeoutMs: 60_000, source })`; success → `output` + `"ready"`;
  `ClaudeCliError` → `error` + `"error"`; `.notify()` each transition.
- **Resource** `storyGeneratedUnitsResource` (`defineResource`, `mode:"push"`,
  loads all rows; hook filters client-side — mirror `auto-start`). Scope by pageId
  later if it grows.

Prompt + feedback are folded **client-side** by the renderer (it owns format +
revision framing) and handed to a *generic* server engine — keeps the server
format-agnostic and renderers web-only. Deliberate single-user-OS trade-off;
server-side prompt slots are deferred.

### Web API (the surface renderers consume)

```ts
// generation/web/hooks.ts
export type GenerationTurn = {
  inputHash: string;     // staleness key for THIS unit's outline subtree
  prompt: string;        // fully-assembled model input (renderer owns context assembly)
  instruction?: string;  // human directive for this turn (fresh guidance OR revision feedback); recorded
};

export function useGeneratedUnits(args: {
  pageId: string; kind: string;
  units: { unitId: string; currentHash: string }[];   // the renderer's current segmentation
}): {
  byUnit: Map<string, {
    status: GenStatus | "none"; output: string | null; error: string | null; isStale: boolean;
    instruction: string | null;   // last turn's directive — lets the UI prefill the iteration field
  }>;
  overall: "none" | "partial" | "generating" | "ready" | "error";
  generate: (unitId: string, turn: GenerationTurn) => Promise<void>;  // regenerate exactly one unit
};
```

Plural/unit-shaped from the start; Blog v1 passes a one-element `units`.
`isStale = status==="ready" && storedHash !== currentHash`, computed per unit.

### Generation requests are *turns*; context is renderer-assembled

The same shape — `generate(unitId, turn)` — serves **every** scope (one slide, one
section, the whole article). What differs is only the `prompt` the renderer
assembles. Because `byUnit` exposes **every** unit's current `output`, a
single-unit regeneration is never context-blind. The renderer can fold any of
these into `turn.prompt`:

- the unit's **outline subtree** (`outlineToBullets`),
- **sibling units' outputs** (from `byUnit`) — for coherence / no repetition /
  transitions when regenerating one slide,
- this unit's **prior output** (revise-in-place),
- **document-level intent** (title, overall goal),
- the user's **`instruction`** for this turn,
- (later, axis C) a **theme/style directive** — kept as guidance, never baked into
  stored content.

So "iterate with context on a single slide" needs **no API change** — it's the
renderer choosing what to put in `prompt`, with `instruction` recording the human
ask for history. "Generate all" = `map` over units (independent jobs → independent
dedup, progress, retry, staleness). A future cohesive *one-call-produces-N-units*
pass is an additive `generateMany` variant — the unit-keyed store doesn't block it.

**Use-case coverage check:**

| Use case | How the API serves it |
|----------|----------------------|
| Generate whole artifact (fresh) | one turn per unit (blog v1: a single `"article"` unit) |
| Regenerate one slide/section | `generate(unitId, turn)` — only that row re-runs |
| Iterate one unit with feedback | same call, `turn.instruction = "make it punchier"`, `prompt` folds in prior output |
| Keep a regen coherent with neighbors | renderer adds sibling `byUnit` outputs into `turn.prompt` |
| Global revision ("more formal") | map the instruction over every unit's turn |
| Re-theme without regenerating | **not a generate call at all** — axis C, render-time |

## `story-core` additions (pure, no new deps)

- `hashOutline(nodes: StoryNode[]): string` — deterministic hash over
  `{type, role, depth, text-payload}`. Called on the **whole forest** (blog v1) or
  a **subtree** (a section/slide) — same function, drives per-unit staleness.
- `outlineToBullets(nodes: StoryNode[]): string` — tree → indented bullets
  (`role:"break"` → `---`). Generic serialization; per-lens *framing* stays in the
  renderer. **Segmentation** (forest → units) is renderer-owned, not here.

## `render` change (within the feature, additive)

Thread `pageId` into renderer dispatch props so generative renderers key
persistence:
- `render/web/slots.ts`: `Story.Renderer` props → `{ story; pageId; activeRendererId }`.
- `render/web/components/story-render.tsx`: pass `pageId`.

Slides is unaffected (its component declares a subset of props → still satisfies
the widened `ComponentType`). No Slides edit.

## `renderers/blog` (new lens — the only generative consumer this task ships)

Path `apps/plugins/story/plugins/renderers/plugins/blog/` (mirror `slides`).

- `internal/segment-blog.ts` — `segmentBlog(story): Unit[]`. **v1 returns a single
  unit** `{ unitId:"article", nodes: story }`. The seam where per-section
  granularity (one unit per top-level node, `unitId = node.id`) drops in later
  with no primitive change.
- `internal/build-blog-prompt.ts` — `buildBlogPrompt(unit, ctx?: { instruction?; prior?; siblings? })`:
  wraps `outlineToBullets(unit.nodes)` with blog framing. Intent: *"Write a
  polished blog article in **clean semantic Markdown** from this outline.
  Top-level → `##` sections; nested → prose paragraphs/sub-headings; `---` →
  thematic break. Match the ideas; invent nothing unrelated. No inline styling, no
  code fences, no preamble."* When `ctx.instruction`/`ctx.prior`/`ctx.siblings` are
  present it appends the prior output + sibling context + *"Revise per: …"* — the
  single code path that already serves both whole-article and (future) per-section
  iteration with context.
- `components/blog-renderer.tsx` — `BlogRenderer({ story, pageId })`:
  - `units = segmentBlog(story).map(u => ({ unitId: u.unitId, currentHash: hashOutline(u.nodes) }))`
  - `gen = useGeneratedUnits({ pageId, kind:"blog", units })`
  - **states** (driven by `gen.overall` / per-unit):
    - `none` → empty card: muted outline preview + **✨ Generate blog** →
      `gen.generate("article", { inputHash, prompt: buildBlogPrompt(unit) })`.
    - `generating` → `<Loading variant="rows" />` ("Writing your article…").
    - `ready` → `<Markdown>{output}</Markdown>` in a `Card` + **Regenerate**.
      If `isStale` → subtle banner *"Outline changed — Regenerate"*.
    - `error` → visible error (fail-loud) + **Retry**.
- `web/index.ts` → `Story.Renderer({ match:"blog", id:"blog", label:"Blog",
  icon: MdArticle, component: BlogRenderer })`.

Artifact is **semantic Markdown** → `<Markdown>` renders real `##`/`###`
hierarchy + `---` rules via the typography tokens (axis C themes it for free),
sidestepping the TextContent typography problem entirely.

## Seams designed-for, NOT built in this task

These need **zero** primitive/schema change to add later — that's the point:

- **Per-unit regeneration (sub-unit).** Already keyed by `unitId`. A renderer
  switches `segment*()` from 1 unit to N (e.g. `unitId = node.id` per slide), and
  adds a per-unit *Regenerate* control. Slides becomes generative on the same
  primitive.
- **Feedback / iteration form (at any scope).** The turn shape already carries
  `instruction`, the renderer already folds `instruction`+`prior`+`siblings` into
  `prompt`, and `byUnit.instruction` prefills the field. Adding the UI = a text
  field calling `gen.generate(unitId, { inputHash, prompt, instruction })` —
  identical for a whole article or one slide. A `story_generation_revisions`
  history table (full turn log) is a pure add.
- **Theme/presentation (axis C).** Content stays semantic, so a theme is a
  render-time choice. The seam: store an optional **per-story, per-renderer
  presentation id** in `marker`'s story config (next to `defaultRendererId`), read
  it in the renderer, and apply it via the existing theme system —
  `ui/variant-region` (`defineVariantRegion`) for swappable chrome / tokens
  presets for skinning. Slides-theme picker and blog-skin both ride this; **no
  regeneration**. (See the `theme` skill + `ui/tokens`, `ui/variant-region`.)

## Plugin tree (new = ★, modified = ✎)

```
✎ apps/plugins/story/plugins/story-core/core/{hash-outline.ts, outline-to-bullets.ts, index.ts}
★ apps/plugins/story/plugins/generation/
    core/   index.ts (GenStatus type)
    shared/ {resources.ts, endpoints.ts}
    server/ index.ts, internal/{tables.ts, resource.ts, routes.ts, generate-job.ts, mutations.ts}
    web/    {index.ts, hooks.ts}
✎ apps/plugins/story/plugins/render/web/{slots.ts, components/story-render.tsx}
★ apps/plugins/story/plugins/renderers/plugins/blog/
    package.json
    web/ index.ts, internal/{segment-blog.ts, build-blog-prompt.ts}, components/blog-renderer.tsx
```

## Cross-plugin imports (boundary-checked, runtime barrels only)

- **generation/server** → `infra/claude-cli/server` (`runClaudePrint`,
  `ClaudeCliError`), `infra/jobs/server` (`defineJob`), `infra/endpoints/server`
  (`implement`), `framework/server-core/core` (`defineResource`, `Resource`),
  `primitives/live-state/core`, `database`, `conversations/model-provider/core` (tier type).
- **generation/shared** → `infra/endpoints/core`, `primitives/live-state/core`, zod.
- **generation/web** → `primitives/live-state/web`, `infra/endpoints/web`, own shared.
- **blog/web** → `web-sdk/core`, `story/render/web` (`Story`), `story-core/core`
  (`StoryNode`, `hashOutline`, `outlineToBullets`), `story/generation/web`
  (`useGeneratedUnits`), `primitives/markdown/web`,
  `primitives/{spacing,card,text,icon-button,loading}/web`, `react-icons/md`.

## Reuse map (don't rebuild)

- `runClaudePrint` — `infra/claude-cli/server` (one-shot LLM, local auth, no key).
- `<Markdown>{md}</Markdown>` — `primitives/markdown/web` (renders `##`/`---`).
- `defineJob`/`.enqueue` — `infra/jobs/server` (durable).
- live-state — mirror `tasks/auto-start/{shared/resources.ts, server/internal/resource.ts, web/hooks.ts}`.
- endpoints — mirror `story/marker` routes wiring.
- `pgTable` standalone — mirror `claude-cli/server/internal/tables.ts`.
- Renderer/contribution shape — mirror `renderers/plugins/slides/web/index.ts`.
- Theme seam — `ui/variant-region` (`defineVariantRegion`), `ui/tokens`, `theme` skill.

## Gotchas / risks

- **LLM output hygiene**: strip stray ```` ``` ```` fences / preamble in the job;
  empty output → status `error` (fail-loud).
- **Timeout**: bump `runClaudePrint` to `timeoutMs: 60_000` (default 15s is short
  for an article); timeout → `ClaudeCliError` → status `error` + visible Retry.
- **Dedup** by `(pageId, kind, unitId)` so double-clicks/regens coalesce.
- **Staleness is derived, never auto-acted** — compare `currentHash` to stored
  `inputHash` per unit; only ever surface *Regenerate*. No polling.
- **Semantic-content discipline**: the prompt must forbid inline styling so axis C
  (theme) stays free. A styled artifact would couple content to presentation.
- **Resource loads all rows** now (mirrors auto-start); scope by `pageId` later.
- **Migration**: `story_generated_units` is the one new table; via `./singularity
  build`, committed.
- **`match` === `id`** ("blog") in lockstep (slides convention).

## Build & verify

1. `./singularity build` (registers new plugins; applies migration).
2. `./singularity check` (`plugin-boundaries` + `migrations-in-sync`).
3. Manual loop at `http://<worktree>.localhost:9000/story`:
   - New story → outline (top-level ideas, nested sub-bullets, a `---` divider).
   - **Blog** → *Generate blog* → flowing Markdown with `##` sections + `<hr>` at
     the divider, matching the ideas.
   - Re-view → instant (no LLM call).
   - Edit outline → *stale* banner → *Regenerate* → new article.
   - `query_db`: `select page_id, kind, unit_id, status, input_hash from
     story_generated_units` → one row, `ready`, hash updates on regenerate.

## Phasing (each lands green)

1. **generation primitive** — unit table + job + endpoint + resource +
   `useGeneratedUnits`. Inert; verify endpoint + `query_db` round-trip.
2. **story-core utils** — `hashOutline` + `outlineToBullets` (+ unit tests).
3. **render** — thread `pageId`.
4. **renderers/blog** — `segmentBlog` (1 unit) + prompt + states + `<Markdown>`.
5. **build + verify**; finalize.

## Future (out of scope here — seams already in place)

- Per-section Blog / per-slide Slides regeneration (axis B sub-units).
- Feedback form + revision history (axis B revisions).
- Slides theme picker / blog skins (axis C presentation), via `ui/variant-region` +
  story config; no regeneration.
- Streaming generation via `claude-api`; per-generation model picker.
- Graduate `generation` to `infra/generated-artifact` at the 2nd consumer.
```

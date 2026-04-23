# Unified Pane Manager (v3)

> **Changes from v2:** Documents the API tweaks forced by the Phase 2 tasks
> migration. All surface shapes are unchanged from v2 at the caller level;
> what changed is the *type* relationship between `open()`, `useParams()`, and
> `PaneObject`'s generics, plus an internal change to how the router matches
> ancestors. v1 → v2 had already moved the pane primitive from `plugin-core/`
> into its own `plugins/pane/`; that holds in v3.

Read v2 first for the full rationale. This doc lists only the diffs and the
reasoning behind each. Phases 3–5 proceed as described in v2.

## What Phase 2 uncovered

Two issues surfaced the moment a second-level nested pane with ancestor-
contributed path params (`/tasks/:taskId/c/:convId`) tried to use the v2 API.

### 1. `.open()` needed full params, not own-only params

v2 wrote the signature as:

```ts
Pane.define<Path, Provides>(…): Pane<InferParams<Path>, Provides>
// and
interface Pane<Params, Provides> {
  useParams(): Params;
  open(params: Params): void;
  …
}
```

where `Params = InferParams<Path>` — **own-only**. That's right for
`useParams()` (design decision 6) but wrong for `open()`. `.open()` builds
a URL for the pane's `fullPath`, which always includes every ancestor's
`:name` segments. The v2 example even used full params:

```tsx
<Button onClick={() => convDocsPane.open({ convId, filePath })}>Docs</Button>
```

but `convDocsPane.ownPath` is `"docs/:filePath*"`, so
`InferParams<ownPath> = { filePath }` — `convId` wouldn't typecheck.

**v3:** `.open()` takes the *full* ancestor-plus-own param set.
`.useParams()` still returns **own-only** per design decision 6.

### 2. Ancestor panes lost their params when a deeper pane matched

v2's `matchPath` required the pattern to consume the entire pathname. When
the URL was `/tasks/:taskId/c/:convId`, only `taskConversationPane` matched;
re-matching `taskDetailPane.fullPath = "/tasks/:taskId"` against the *full*
pathname returned `null`, so `taskDetailPane.useParams().taskId` came out
`undefined`.

**v3:** `matchPath` gains a `{ prefix: true }` mode that allows unconsumed
trailing segments. Ancestors in the match chain are re-matched in prefix
mode and their own params are populated correctly.

## API diffs vs v2

### `PaneObject` gains a third generic

```ts
// v2
interface PaneObject<Params, Provides> {
  useParams(): Params;
  open(params: Params): void;
  …
}

// v3
interface PaneObject<FullParams = {}, Provides = void, OwnParams = FullParams> {
  useParams(): OwnParams;           // own-only
  open(params: FullParams): void;   // ancestor + own
  …
}
```

Defaulting `OwnParams = FullParams` means top-level panes (where they're
equal) keep the v2 two-generic ergonomics — callers almost never write
`PaneObject` by hand.

### `Pane.define` infers parent params from `parent`

```ts
// v3
function define<
  Path extends string = "",
  Provides = void,
  ParentParams = {},
>(args: {
  id: string;
  parent?: PaneObject<ParentParams, any, any>;
  path?: Path;
  component: ComponentType;
  provides?: TypeMarker<Provides>;
  chrome?: PaneChromeConfig<ParentParams & InferParams<Path>> | false;
}): PaneObject<
  ParentParams & InferParams<Path>,  // FullParams
  Provides,
  InferParams<Path>                  // OwnParams
>;
```

`ParentParams` is inferred from the `parent` pane's `FullParams` generic —
this is why `PaneObject`'s first generic stays `FullParams`. Each child pane
accumulates its own segment on top.

`chrome.title(params)` and `chrome.expand(params)` receive `FullParams`
(the pane's fully resolved param set), which is what URL-building callbacks
want. The v2 examples already assumed this.

### `MatchEntry` gains `fullParams`

```ts
// v3
export interface MatchEntry {
  pane: PaneInternal;
  params: Record<string, string>;      // own-only; powers useParams()
  fullParams: Record<string, string>;  // ancestor + own; powers buildUrl
}
```

Rationale: `useParams()` needs own-only; `buildUrl`, `.close()`, and
`chrome.expand` need full. Storing both once at match time beats
recomputing.

`.close()` now uses `parentEntry.fullParams` when rebuilding the parent's
URL (the parent's `fullPath` may have its own `:name`s to fill).

### Prefix matching

```ts
// v3
export function matchPath(
  pattern: string,
  pathname: string,
  options: { prefix?: boolean } = {},
): Record<string, string> | null;
```

`prefix: true` succeeds when the pattern consumes *some* prefix of the
pathname (or all of it). `matchRegistry` picks the longest *exact* match
for the leaf, then uses prefix mode to derive each ancestor's params from
the same pathname.

## What callers write

Unchanged. The v2 examples now *actually* typecheck as written. The only
observable effect of v3 is that `someChildPane.open({ …ancestorParams,
…ownParams })` is the correct call shape (which v2 already suggested by
example).

## Phase 2 verification (status)

All checkpoints from v2 §Verification pass for tasks:

- `/tasks` — tasks list + "Select a task" placeholder.
- `/tasks/:taskId` — task detail rendered in the right column.
- `/tasks/:taskId/c/:convId` — three-column layout, conversation view on
  the right.
- Back button walks the chain.
- Full reload at any of the three URLs restores the correct layout.
- Direct navigate to `/c/:convId` (the chrome.expand target) handed off to
  the legacy Shell.Route, which still owns the top-level conversation view
  until Phase 3.

The one Phase 2 rough edge *not* blocking shipment: `TaskConversationBody`
doesn't call `<PaneChrome pane={taskConversationPane}>` because
`ConversationView` already renders its own toolbar. Stacking two headers
looked ugly. Phase 3 merges them when `conversationPane` itself becomes a
real pane — the standard chrome can take over then.

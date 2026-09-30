# text

The semantic typography primitive. `<Text variant tone as>` is the single
sanctioned way to set text hierarchy: you pick a **variant** (a closed set of
size + line-height + weight + tracking bundles), never a raw `text-sm`/`leading-6`.
The prop is named `variant` (not `role`) so it never collides with the DOM/ARIA
`role` attribute when a host spreads props onto `<Text>`.

## The closed role ladder

The variants are built on ONE closed set of typographic **roles**, declared
once as `TYPE_ROLES` in this plugin's `core/roles.ts` (exported from
`@plugins/primitives/plugins/css/plugins/text/core`). Everything else derives
from it: the `type-scale` token group's role keys (`roleTokenKeys()`), the
`text-<role>` / `text-<role>-compact` / `font-<role>` utilities in ui-kit's
`web/theme/app.css`, and the `<Text variant>` union. A component picks a role; a
theme sets roles (see the `theme` skill); **nothing mints a component-named type
token** — no `fontSizeChip`, no `sidebarLabelSize`, no `text-<component>`
utility. If no role fits, the fix is a new entry in `TYPE_ROLES`, not a token.

Per role:

- **Tokens** — `fontSize<Role>` + `lineHeight<Role>`, both literal LENGTHS (so
  `--font-scale` multiplies them; a unitless line height would be scaled twice).
- **Weight** — `weight` in `TYPE_ROLES`. A shared weight name (`normal` …
  `bold`) is frozen in the role's utility, read from the shared
  `--font-weight-<name>`. `"token"` (`control`, `tag`) means the role owns
  `fontWeight<Role>` + `fontWeight<Role>Strong` and a weight-only `font-<role>` /
  `font-<role>-strong` utility, so a control that swaps its size rung keeps its
  weight (Button, Badge, ToggleChip).
- **Compact rung** — `compact`: the next rung down at the `xs` density, keeping
  this role's weight/tracking (see *Compact density*). `"own"` (`tag`) means the
  role has its own `fontSize<Role>Compact` / `lineHeight<Role>Compact` tokens —
  a theme sets its count chips a half-step below the 2xs sub-scale.

## Variants

Each role variant maps to its `text-<role>` `@utility` in
`plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css`, backed by the
`type-scale` token group's `--font-size-<role>` / `--line-height-<role>` vars.
A theme resizes every variant by setting role tokens (or `fontScale`).

| Variant      | kind      | size      | line-height | weight            | tracking | Replaces                  |
| ------------ | --------- | --------- | ----------- | ----------------- | -------- | ------------------------- |
| `display`    | role      | 3rem      | 3.25rem     | 700               | -0.035em | `text-5xl font-bold`      |
| `title`      | role      | 1.25rem   | 1.75rem     | 600               | -0.01em  | `text-xl font-semibold`   |
| `heading`    | role      | 1.125rem  | 1.625rem    | 600               | -0.005em | `text-lg font-semibold`   |
| `subheading` | role      | 1rem      | 1.5rem      | 600               | 0        | `text-base font-semibold` |
| `body`       | role      | 0.875rem  | 1.5rem      | 400               | 0        | `text-sm leading-6`       |
| `label`      | role      | 0.8125rem | 1.25rem     | 500               | 0        | `text-sm font-medium`     |
| `group`      | role      | 0.75rem   | 1rem        | 600               | 0        | a group header's `text-xs font-semibold` |
| `control`    | role      | 0.875rem  | 1.25rem     | 500 (token, strong) | 0      | a button's own `text-sm font-medium` |
| `caption`    | role      | 0.75rem   | 1rem        | 400               | 0        | `text-xs`                 |
| `tag`        | role      | 0.75rem   | 1rem        | 500 (token, strong) | 0      | a chip's `text-xs font-medium` |
| `code`       | role      | 0.75rem   | 1.25rem     | 400               | 0        | `font-mono text-xs leading-5` |
| `eyebrow`    | treatment | caption   | caption     | caption           | wide     | `text-xs uppercase …`     |
| `count`      | treatment | caption   | caption     | control           | 0        | a counter's `text-caption` (a toolbar button's "3", "+387") |

(Sizes are the Default theme's; a theme overrides them.)

`tone` layers a foreground color (`default | strong | subtle | muted | faint | primary | destructive`; `faint` is the dimmer tier below muted, from the palette's `faintForeground`; `strong` / `subtle` are the palette's `strongForeground` / `subtleForeground`, which default to body text and to muted, so they only differ where a theme sets them);
`as` swaps the host element (default `span`). `cn(variant, tone, className)` —
caller `className` wins last, so layout margins/truncation compose on top.

`display` is the landing/marketing headline rung — the one role above `title`,
and the only one sized for a page whose whole job is a single sentence. App
chrome never reaches for it; a page has at most one.

`code` is monospaced text, block AND inline (log viewers, code blocks, an inline
`code` span, math source). It has its own tokens (`fontSizeCode` /
`lineHeightCode`, default caption size with the looser label line height —
code wraps and is scanned line-by-line) and owns the mono **family** as well as
the metrics, so "code" is one decision — do not pair it with `font-mono`. Its
compact rung is the 2xs size at the caption line height.

`group` is the heading of a group of rows in a list or sidebar — a quiet group
header ("Queue 14", data-view's `headerStyle="quiet"`). Its own role rather than
`label`, so a theme sizes its group heads apart from the rows they head (Mist:
12.5px over 13px rows). Semibold, frozen; its compact rung is the caption
metrics at that weight.

`control` is the words ON a control — a tab's title, and (through
`buttonTextClassFor`) every `Button`'s label — so a region sets both at once.
Its weight is a token (`--font-weight-control`, plus `font-control-strong` for a
primary action): the app chrome's fixed theme sets its controls to regular
weight without re-weighting the prose around them. Its compact rung is the
caption metrics at the control weight.

`tag` is the words on a chip — a `Badge`, a pane header's model/status chips, a
transcript card's tool badge (`text-tag font-tag-strong`). Weight is a token
like `control`'s; its compact rung (`text-tag-compact`, a `Badge` at `xs`) has
its own size tokens.

`count` is a **treatment**, not a role: a number beside a glyph — a toolbar
button's count, a diff's `+387` — rendered as the control's compact rung with
tabular figures (`text-control-compact tabular-nums`). It owns no tokens; a
theme moves it by setting the caption / control roles.

`textVariantClass(variant)` returns a variant's classes as a string, for the
elements `<Text>` cannot be — a shiki `<pre>`, a `dangerouslySetInnerHTML` div, a
Lexical input. Same own-it-⇒-component rule as the layout helpers. It reads no
ambient `ControlSize`, so a helper-styled box does not compact.

`eyebrow` is the overline / section-label **treatment**. Like `count` it is
**not** a utility of its own — it reuses `text-caption` and adds the small-caps
treatment (`uppercase tracking-wide whitespace-nowrap`). Tone stays orthogonal.

`text-2xs` / `text-3xs` are the sanctioned sub-scale below role granularity
(`TYPE_SUBSCALE`: times, chip internals). They are type-scale tokens too and
follow `--font-scale`.

## `fontScale`

The `type-scale` group's `fontScale` (`--font-scale`, default `1`) is the ONE
multiplier on every role's size and line height, the compact rungs, the
sub-scale and the inherited base — "make the text one step bigger" is this one
value, in any theme scope, sub-themes included.

- **Applied in the utilities, at the element.** Every role utility writes
  `font-size: calc(var(--font-size-<role>) * var(--font-scale))` (same for
  line-height), and the `@theme inline` bridges for `text-2xs` / `text-3xs` do
  likewise. Nothing scales `html`, so spacing and rem tokens are untouched.
- **The inherited base** is set at every `[data-theme-scope]` root as
  `calc(var(--font-size-base) * var(--font-scale))`, and `fontSizeBase` is `1rem`,
  never `1em`: every pane is a nested `<Theme>` scope, so an em base would
  compound the scale once per nesting level. `lineHeightBase` stays unitless.
- **Role line heights are lengths**, so the multiplication is exact.
- **Not scaled:** weights, the reading measure (`measureReading`), and
  plugin-local CSS that hard-codes px sizes.
- **A TS consumer that needs a role's raw metric** (a page block's bullet
  aligned to the body line) uses `typeVar("line-height-body")` from `core/` —
  the same `calc(… * var(--font-scale))` expression — never
  `var(--line-height-body)`, which would skip the scale.

### SectionLabel

`SectionLabel` (also exported from this barrel) is the small-caps muted
section/eyebrow label — a thin composition over
`<Text variant="eyebrow" tone="muted" as="div">`. It was previously a standalone
`section-label` plugin; the eyebrow geometry now lives here as a Text variant
(one definition) and the helper supplies the muted tone + block host. Import from
`@plugins/primitives/plugins/css/plugins/text/web`.

## Single-line truncation (the folded `TruncatingText`)

`Text` IS the truncation leaf — the former `TruncatingText` plugin folded into it.
Whether it truncates is **not** its own prop: it reads the ambient `SingleLine`
context (`useSingleLine()` from `…/ui-kit/web`, the exact mirror of `ControlSize`).

- Inside a **line container** (`Frame` slot / `Row` / `Bar` / collapsible header,
  which provide `SingleLineProvider value={true}`) a `<Text>` applies the
  `block w-fit max-w-full min-w-0 truncate` recipe and ellipsizes on one line,
  auto-deriving a `title` tooltip from string children.
- Inside a **flow container** (`Stack` col / `Stack wrap` / `Column` / `Cluster`,
  which reset to `value={false}` + `whitespace-normal`) it wraps.

### Why the leaf is block-level

The recipe used to say `inline-block`, and that is the whole of a misalignment
the repo carried at every row built the canonical way. An inline-level box whose `overflow` is not
`visible` — which `truncate` makes true — hands the line it sits on the bottom of
its own margin box as its baseline. Put such a leaf in a plain block parent (a
`<Fill>` cell is one) and the parent still has to leave room *below* that
baseline for its own strut's descender: at 16px/24px the cell measured 30px for
24px of text. The row's `items-center` then centred the sibling icon against that
inflated box and dropped it ~3px below the words it labels — the canonical
`Line > Icon + Fill(Text)` row, quietly wrong at all ~57 places a `<Text>` sits
directly in a `<Fill>`.

`block` removes the inline formatting context, so there is no strut and the
parent's height is exactly the leaf's. It is exact at every font-size pairing,
which `vertical-align: top` is not (that only helps while the leaf's line-height
is at least the parent's). `w-fit` restores the shrink-to-fit width
`inline-block` was also providing, so a `hover:underline` or a background still
ends where the words end; in a flex or grid parent it changes nothing, since the
item is blockified and content-sized there either way.

It is the [`Badge`](../badge/CLAUDE.md) baseline incident one layer down — an
inline-flex chip handing a sentence its *icon's* bottom edge — and the same class
of bug: a box offering the line a baseline that is not its text's.

There is deliberately **no truncation on/off prop** — "non-truncating text in a
line row" is a contradiction, so misuse is structurally impossible: pick the
container. `side="start"` flips the ellipsis to the leading edge (file paths) via
the RTL technique; it's inert outside a single-line context. The rare
forced-single-line-in-a-flow-region case wraps the leaf in
`<SingleLineProvider value={true}>` explicitly. The `min-w-0` lives only here (the
single owner); `variant` is optional (omit = inherit the surrounding typography,
the role `TruncatingText` used to fill). The `text/block-parent-no-op` geometry
fixture guards the block-level hardening; `web/__tests__/single-line.test.tsx`
covers the context behavior.

This plugin also hosts the `no-clip-without-nowrap` lint rule (relocated from the
deleted `truncating-text` plugin) — see `lint/index.ts`.

## Compact density

`Text` reads the ambient `ControlSize` (the region signal — `Bar` is `sm`,
`DataTable`/tree rows/compact `Card` are `xs`). At the compact `xs` density it
swaps each variant for its **weight-preserving `-compact` form** (the next
size+line-height rung down with the original weight/tracking kept, so a compact
subheading stays semibold and still reads as a subheading). `sm`/`md`/`lg` keep
the comfortable size. There is **no prop** — the region owns it, mirroring the
control-density arc invariant (size is a property of where you are, not of the
leaf). An omitted `variant` inherits the surrounding typography, so there's
nothing to compact.

The single threshold lives in `textStepFor(density)` in
`…/ui-kit/web/theme/control-size.tsx` — **the one density→text-step policy
shared by `Button`, `Badge`, AND `Text`** (so neighbours in a row can't desync
their type rung). The `-compact` utilities live beside the base `text-<role>`
utilities in `…/ui-kit/web/theme/app.css`. `web/__tests__/compact-density.test.tsx`
covers the swap.

### Three disjoint sizing axes

| Axis                  | Owner                          | Scope      | Controls                                             |
| --------------------- | ------------------------------ | ---------- | --------------------------------------------------- |
| **Density preset**    | `tokens/density`               | global     | padding / spacing / control heights (no font sizes) |
| **Type scale**        | `tokens/type-scale`            | per theme  | every role's size/line-height/weight + `fontScale`  |
| **ControlSize**       | `ControlSizeProvider` / region | per-region | affordance density → height/icon/chip/**text step** |

The `tokens/density` group has **zero font-size tokens** — typography is the
*separate* `tokens/type-scale` group (and the `type-scale:closed-role-ladder`
check fails if any other group declares one). So `ControlSize → Text` and the
density preset never collide: `ControlSize` picks a *different role*; the
type-scale preset still themes whichever role is picked.

The three write different properties (padding vs font-size vs which role is
picked), so there is no container/child race here and nothing to escape from —
this is **not** the [rail contract](../rail/CLAUDE.md), despite the surface
resemblance of "they compose, no double-apply". Do not reach for a rail utility
to reconcile them; they never needed reconciling.

## Enforcement

- `lint/no-adhoc-typography.ts` fails `./singularity check` on raw named font
  sizes (`text-{xs,sm,base,lg,xl,2xl…}`) and `leading-*` in any class-name
  context — reach for `<Text variant>` (or its `text-<role>` utility) instead.
  The shared class walk reads `className`, `cn` / `clsx` / `twMerge` AND `cva`
  (a `cva` table's base and variant values are classes; its variant names and
  `defaultVariants` are not), and follows same-file string consts and
  object/array maps (`cn(TONE[tone])`). It enforces repo-wide with no `ignores`
  allowlist. A genuinely fixed raw size escapes per-site via
  `// eslint-disable-next-line text/no-adhoc-typography -- reason`.
- `type-scale/lint/no-arbitrary-font-size.ts` bans `text-[Npx]` /
  `text-[Nrem]`; only the sub-scale sizes (10px / 11px) auto-fix.
- The `type-scale:closed-role-ladder` check (in `ui/tokens/type-scale/check/`)
  keeps the ladder closed: the type-scale keys are exactly `roleTokenKeys()`
  plus its short non-role list; no other token group declares a font size,
  line height or weight; every ui-kit `@utility` that sets type metrics is a
  derived role utility multiplied by `--font-scale`; the lint message above names
  every `<Text>` variant; and no `.ts(x)` outside this plugin and type-scale
  reads a raw `var(--font-size-*)` / `var(--line-height-*)`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Semantic typography primitive: <Text variant tone as> picks a frozen size/line-height/weight role from the typography token group (incl. the eyebrow/section-label role). The single sanctioned home for text hierarchy; raw text-size/leading-* is banned by no-adhoc-typography.
- Web:
  - Uses:
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.textStepFor`
    - `primitives/css/ui-kit.useControlSize`
    - `primitives/css/ui-kit.useSingleLine`
  - Exports (types):
    - `SectionLabelProps`
    - `TextProps`
    - `TextTone`
    - `TextVariant`
    - `TruncateSide`
  - Exports (values):
    - `SectionLabel`
    - `Text`
    - `textVariantClass`
- Cross-plugin:
  - Imported by:
    - `active-data/commit-link`
    - `active-data/plugin-link`
    - `active-data/task`
    - `apps-core/layout`
    - `apps-core/surface/floating`
    - `apps-core/surface/floating/wallpaper`
    - `apps-core/surface/floating/wallpaper/from-url`
    - `apps-core/surface/floating/wallpaper/upload`
    - `apps/agent-manager/shell`
    - `apps/agent-manager/welcome`
    - `apps/browser/bookmarks`
    - `apps/browser/start-page`
    - `apps/browser/tabs`
    - `apps/browser/webview`
    - `apps/chord/curriculum`
    - `apps/chord/piano`
    - `apps/chord/shell`
    - `apps/chord/song-index`
    - `apps/chord/trainer`
    - `apps/deploy/analytics/dashboard`
    - `apps/deploy/composition`
    - `apps/deploy/deploy-history`
    - `apps/deploy/deployments`
    - `apps/deploy/health`
    - `apps/deploy/local-serve`
    - `apps/deploy/remote-deploy`
    - `apps/deploy/servers`
    - `apps/deploy/ssh-setup`
    - `apps/deploy/ssh-setup/hetzner`
    - `apps/events/event-list`
    - `apps/events/shell`
    - `apps/events/sources`
    - `apps/events/sources/source-detail/runs`
    - `apps/events/sources/source-detail/runs/caveats`
    - `apps/events/sources/source-detail/schedule`
    - `apps/events/sources/source-detail/settings`
    - `apps/events/sources/source-detail/status`
    - `apps/home/shell`
    - `apps/mail/reading-pane`
    - `apps/mail/search`
    - `apps/mail/shell`
    - `apps/mail/sync-status`
    - `apps/mail/threads`
    - `apps/pages/history`
    - `apps/pages/page-tree`
    - `apps/pages/trash`
    - `apps/pages/welcome`
    - `apps/pages/welcome/quick-create`
    - `apps/pages/welcome/recent-pages`
    - `apps/prototypes/canvas`
    - `apps/prototypes/compare`
    - `apps/prototypes/present`
    - `apps/sonata/library`
    - `apps/sonata/piano-roll`
    - `apps/sonata/primitives/jog-wheel`
    - `apps/sonata/progress/scrubber`
    - `apps/sonata/progress/sections`
    - `apps/sonata/rich/chord-progression`
    - `apps/sonata/rich/chord-readout`
    - `apps/sonata/rich/key-readout`
    - `apps/sonata/rich/rhythm-controls`
    - `apps/sonata/rich/voicing-controls`
    - `apps/sonata/shell`
    - `apps/sonata/songsheet`
    - `apps/sonata/sources/midi`
    - `apps/sonata/sources/ultimate-guitar`
    - `apps/sonata/track-mixer`
    - `apps/sonata/transport-bar`
    - `apps/sonata/transpose`
    - `apps/studio/compositions`
    - `apps/studio/compositions/closure-tree`
    - `apps/studio/compositions/contributors`
    - `apps/studio/compositions/entry-points`
    - `apps/studio/compositions/membership-summary`
    - `apps/studio/compositions/release`
    - `apps/studio/compositions/release/release-artifact`
    - `apps/studio/compositions/release/release-info`
    - `apps/studio/compositions/release/release-logs`
    - `apps/studio/contributions`
    - `apps/studio/contributions/tables/foreign-keys`
    - `apps/studio/contributions/tables/row-count`
    - `apps/studio/explorer`
    - `apps/studio/graph`
    - `apps/website/improve`
    - `apps/website/landing/contact`
    - `apps/website/landing/hero`
    - `apps/website/landing/layers`
    - `apps/website/landing/screenshot`
    - `apps/website/landing/story-link`
    - `apps/website/pages/download`
    - `apps/website/shell`
    - `auth`
    - `auth/apple-signing/setup-wizard`
    - `auth/google-maps/setup-wizard`
    - `auth/google/setup-wizard`
    - `backup`
    - `backup/runs-arm`
    - `build`
    - `build/build-info`
    - `build/build-logs`
    - `build/deployment`
    - `build/serve-composition`
    - `code-explorer`
    - `code-explorer/commit-detail`
    - `code-explorer/file-resolve`
    - `config_v2/config-link`
    - `config_v2/settings`
    - `conversations/agents`
    - `conversations/all-conversations`
    - `conversations/conversation-preprompt`
    - `conversations/conversation-ui/item`
    - `conversations/conversation-ui/row`
    - `conversations/conversation-view`
    - `conversations/conversation-view/allow-monitor`
    - `conversations/conversation-view/artifacts`
    - `conversations/conversation-view/branch`
    - `conversations/conversation-view/code/file-pane`
    - `conversations/conversation-view/code/file-pane/markdown`
    - `conversations/conversation-view/commits-graph`
    - `conversations/conversation-view/dependencies`
    - `conversations/conversation-view/jsonl-viewer`
    - `conversations/conversation-view/jsonl-viewer/assistant-text`
    - `conversations/conversation-view/jsonl-viewer/assistant-thinking`
    - `conversations/conversation-view/jsonl-viewer/attachment`
    - `conversations/conversation-view/jsonl-viewer/attachment/agent-listing-delta`
    - `conversations/conversation-view/jsonl-viewer/attachment/command-permissions`
    - `conversations/conversation-view/jsonl-viewer/attachment/deferred-tools`
    - `conversations/conversation-view/jsonl-viewer/attachment/directory-listing`
    - `conversations/conversation-view/jsonl-viewer/attachment/environment`
    - `conversations/conversation-view/jsonl-viewer/attachment/hook-additional-context`
    - `conversations/conversation-view/jsonl-viewer/attachment/hook-error`
    - `conversations/conversation-view/jsonl-viewer/attachment/hook-success`
    - `conversations/conversation-view/jsonl-viewer/attachment/instructions`
    - `conversations/conversation-view/jsonl-viewer/attachment/mcp-instructions-delta`
    - `conversations/conversation-view/jsonl-viewer/attachment/nested-memory`
    - `conversations/conversation-view/jsonl-viewer/attachment/prompt-snapshot`
    - `conversations/conversation-view/jsonl-viewer/attachment/session-context`
    - `conversations/conversation-view/jsonl-viewer/attachment/skill-listing`
    - `conversations/conversation-view/jsonl-viewer/attachment/structured-output`
    - `conversations/conversation-view/jsonl-viewer/attachment/task-reminder`
    - `conversations/conversation-view/jsonl-viewer/code-listing`
    - `conversations/conversation-view/jsonl-viewer/collapsible-card`
    - `conversations/conversation-view/jsonl-viewer/event-counter`
    - `conversations/conversation-view/jsonl-viewer/fields-card`
    - `conversations/conversation-view/jsonl-viewer/file-path`
    - `conversations/conversation-view/jsonl-viewer/meta-prompt`
    - `conversations/conversation-view/jsonl-viewer/preprompt`
    - `conversations/conversation-view/jsonl-viewer/queued-prompt-card`
    - `conversations/conversation-view/jsonl-viewer/subagents`
    - `conversations/conversation-view/jsonl-viewer/teammate-message`
    - `conversations/conversation-view/jsonl-viewer/tool-call`
    - `conversations/conversation-view/jsonl-viewer/tool-call/add-task`
    - `conversations/conversation-view/jsonl-viewer/tool-call/agent`
    - `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`
    - `conversations/conversation-view/jsonl-viewer/tool-call/bash`
    - `conversations/conversation-view/jsonl-viewer/tool-call/edit`
    - `conversations/conversation-view/jsonl-viewer/tool-call/flag-raise`
    - `conversations/conversation-view/jsonl-viewer/tool-call/page-tools`
    - `conversations/conversation-view/jsonl-viewer/tool-call/read`
    - `conversations/conversation-view/jsonl-viewer/tool-call/skill`
    - `conversations/conversation-view/jsonl-viewer/tool-call/task-tools`
    - `conversations/conversation-view/jsonl-viewer/tool-call/tool-search`
    - `conversations/conversation-view/jsonl-viewer/tool-call/workflow`
    - `conversations/conversation-view/jsonl-viewer/tool-call/write`
    - `conversations/conversation-view/jsonl-viewer/user-image`
    - `conversations/conversation-view/jsonl-viewer/user-text`
    - `conversations/conversation-view/op-status`
    - `conversations/conversation-view/pending-turn`
    - `conversations/conversation-view/push-profiling`
    - `conversations/conversation-view/running-agents`
    - `conversations/conversation-view/tasks-panel`
    - `conversations/conversation-view/turn-summary`
    - `conversations/recover`
    - `conversations/summary`
    - `debug/boot-profile`
    - `debug/broadcasts`
    - `debug/claude-cli-calls`
    - `debug/config-orphans`
    - `debug/health-monitor`
    - `debug/heap-snapshot`
    - `debug/live-state-churn/emit`
    - `debug/live-state-health`
    - `debug/memory`
    - `debug/profiling`
    - `debug/profiling/boot`
    - `debug/profiling/ops`
    - `debug/profiling/ops/op-gantt`
    - `debug/profiling/runtime`
    - `debug/queue`
    - `debug/queue-health`
    - `debug/read-set`
    - `debug/render-profiler`
    - `debug/reports`
    - `debug/sentinel`
    - `debug/slow-ops/cluster`
    - `debug/slow-ops/pane`
    - `debug/timeline`
    - `debug/trace/boot`
    - `debug/trace/client-boot`
    - `debug/trace/contention`
    - `debug/trace/engine`
    - `debug/trace/gates`
    - `debug/trace/pane`
    - `debug/trace/spans`
    - `debug/trace/stall`
    - `debug/worktree-cleanup`
    - `fields/color/table`
    - `fields/date/filter`
    - `fields/enum/column-config`
    - `fields/json/config`
    - `fields/number/filter`
    - `fields/reorder-tree/config`
    - `fields/secret/config`
    - `fields/variant/config`
    - `framework/web-core`
    - `history/dialog`
    - `infra/claude-cli`
    - `infra/events-test`
    - `integrations/google-maps`
    - `layouts/route-fallback`
    - `map/google`
    - `page/annotations/agent-notes/authorship`
    - `page/annotations/todo/task-link`
    - `page/bookmark`
    - `page/code-block`
    - `page/editor`
    - `page/embed`
    - `page/file`
    - `page/formatting/color`
    - `page/formatting/link`
    - `page/inline-date`
    - `page/map`
    - `page/math/equation`
    - `page/math/inline`
    - `page/page-link`
    - `page/place`
    - `page/place/map-layer`
    - `page/prompt/block`
    - `page/read-only-view`
    - `page/sub-page`
    - `page/table`
    - `plugin-meta/facets/contributions/render-detail`
    - `plugin-meta/facets/cross-refs/render-detail`
    - `plugin-meta/facets/db-schema/render-detail`
    - `plugin-meta/facets/exports/render-detail`
    - `plugin-meta/facets/registrations/render-detail`
    - `plugin-meta/facets/resources/render-detail`
    - `plugin-meta/facets/routes/render-detail`
    - `plugin-meta/facets/slots/render-detail`
    - `plugin-meta/plugin-view`
    - `plugin-meta/plugin-view/dependencies`
    - `plugin-meta/plugin-view/inclusion`
    - `plugin-meta/plugin-view/sub-plugins`
    - `primitives/action-presentation`
    - `primitives/command-palette`
    - `primitives/commit-list`
    - `primitives/css/color-picker`
    - `primitives/css/control-panel`
    - `primitives/css/layout-harness`
    - `primitives/css/radio-group`
    - `primitives/data-table`
    - `primitives/data-view`
    - `primitives/data-view/gallery`
    - `primitives/data-view/icons`
    - `primitives/data-view/list`
    - `primitives/data-view/table`
    - `primitives/date-picker`
    - `primitives/diff-view`
    - `primitives/error-boundary`
    - `primitives/filter-chips`
    - `primitives/folder-picker`
    - `primitives/graph-canvas`
    - `primitives/icon-picker`
    - `primitives/launch`
    - `primitives/log-channels`
    - `primitives/markdown`
    - `primitives/outline/rail`
    - `primitives/overlay/image-viewer`
    - `primitives/overlay/imperative-dialog/confirm`
    - `primitives/overlay/tooltip`
    - `primitives/pane`
    - `primitives/rank-reorder`
    - `primitives/setup-steps`
    - `primitives/text-editor/composer/picker-pill`
    - `primitives/ui-context/element-picker`
    - `reorder/editor`
    - `reorder/node-types/header`
    - `reorder/node-types/overflow`
    - `review/code-review`
    - `review/plugin-changes`
    - `review/plugin-changes/api-changes`
    - `review/plugin-changes/file-changes`
    - `screenshot`
    - `screenshot/draw-on-app`
    - `search/quick-find`
    - `shell/health-report`
    - `shell/notifications`
    - `stats`
    - `stats/commits`
    - `stats/cost`
    - `stats/pushes`
    - `stats/responsiveness`
    - `stats/tasks`
    - `tasks/attempt-view`
    - `tasks/task-attachments`
    - `tasks/task-dependencies`
    - `tasks/task-description`
    - `tasks/task-draft-form`
    - `tasks/task-events`
    - `tasks/task-graph`
    - `tasks/task-header`
    - `tasks/task-status`
    - `ui/icons/emoji`
    - `ui/segmented-progress-bar`
    - `ui/segmented-progress-bar/dots`
    - `ui/tab-bar/chip`
    - `ui/tab-bar/connected`
    - `ui/tab-bar/customizer`
    - `ui/tab-bar/underline`
    - `ui/theme-engine/quick-theme`
    - `ui/theme-engine/theme-customizer`
    - `ui/theme-engine/theme-gallery`
    - `ui/tokens/icons`
    - `ui/tokens/shadow`
    - `ui/tweakcn/community-browser`
    - `ui/variant-region`
- Core:
  - Exports (types):
    - `TextTreatment`
    - `TypeRole`
    - `TypeSubscale`
    - `TypeVarName`
  - Exports (values):
    - `roleTokenKeys`
    - `TEXT_TREATMENTS`
    - `TYPE_ROLES`
    - `TYPE_SUBSCALE`
    - `typeVar`

<!-- AUTOGENERATED:END -->

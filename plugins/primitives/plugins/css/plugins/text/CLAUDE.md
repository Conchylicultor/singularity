# text

The semantic typography primitive. `<Text variant tone as>` is the single
sanctioned way to set text hierarchy: you pick a **variant** (a closed set of
size + line-height + weight + tracking bundles), never a raw `text-sm`/`leading-6`.
The prop is named `variant` (not `role`) so it never collides with the DOM/ARIA
`role` attribute when a host spreads props onto `<Text>`.

## Variants

Each variant maps to a `text-<variant>` `@utility` in
`plugins/framework/plugins/web-core/web/theme/app.css`, backed by the
`tokens/typography` token group's `--font-size-<variant>` / `--line-height-<variant>`
runtime vars. Picking a typography preset re-themes every variant together.

| Variant      | size      | line-height | weight | tracking | Replaces                  |
| ------------ | --------- | ----------- | ------ | -------- | ------------------------- |
| `title`      | 1.25rem   | 1.75rem     | 600    | -0.01em  | `text-xl font-semibold`   |
| `heading`    | 1.125rem  | 1.625rem    | 600    | -0.005em | `text-lg font-semibold`   |
| `subheading` | 1rem      | 1.5rem      | 600    | 0        | `text-base font-semibold` |
| `body`       | 0.875rem  | 1.5rem      | 400    | 0        | `text-sm leading-6`       |
| `label`      | 0.8125rem | 1.25rem     | 500    | 0        | `text-sm font-medium`     |
| `caption`    | 0.75rem   | 1rem        | 400    | 0        | `text-xs`                 |
| `eyebrow`    | 0.75rem   | 1rem        | 400    | wide     | `text-xs uppercase …`     |

`tone` layers a foreground color (`default | muted | primary | destructive`);
`as` swaps the host element (default `span`). `cn(variant, tone, className)` —
caller `className` wins last, so layout margins/truncation compose on top.

`eyebrow` is the overline / section-label role. Unlike the others it is **not** a
single `text-eyebrow` utility — it reuses `text-caption` and adds the small-caps
treatment (`uppercase tracking-wide whitespace-nowrap`). Tone stays orthogonal.

`text-2xs`/`text-3xs` stay as a sanctioned sub-scale for chips/badges (below
variant granularity). Code/mono is out of scope (use `HighlightedCode` / markdown
`code`).

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
  `inline-block max-w-full min-w-0 truncate` recipe and ellipsizes on one line,
  auto-deriving a `title` tooltip from string children.
- Inside a **flow container** (`Stack` col / `Stack wrap` / `Column` / `Cluster`,
  which reset to `value={false}` + `whitespace-normal`) it wraps.

There is deliberately **no truncation on/off prop** — "non-truncating text in a
line row" is a contradiction, so misuse is structurally impossible: pick the
container. `side="start"` flips the ellipsis to the leading edge (file paths) via
the RTL technique; it's inert outside a single-line context. The rare
forced-single-line-in-a-flow-region case wraps the leaf in
`<SingleLineProvider value={true}>` explicitly. The `min-w-0` lives only here (the
single owner); `variant` is optional (omit = inherit the surrounding typography,
the role `TruncatingText` used to fill). The `text/block-parent-no-op` geometry
fixture guards the inline-block hardening; `web/__tests__/single-line.test.tsx`
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

### Three orthogonal axes (they compose, no double-apply)

| Axis                  | Owner                          | Scope      | Controls                                             |
| --------------------- | ------------------------------ | ---------- | --------------------------------------------------- |
| **Density preset**    | `tokens/density`               | global     | padding / spacing / control heights (no font sizes) |
| **Type-scale preset** | `tokens/type-scale`            | global     | the font-size/weight of every role                  |
| **ControlSize**       | `ControlSizeProvider` / region | per-region | affordance density → height/icon/chip/**text step** |

The `tokens/density` preset has **zero font-size tokens** — typography is a
*separate* global preset (`tokens/type-scale`). So `ControlSize → Text` and the
density preset never collide: `ControlSize` picks a *different role*; the
type-scale preset still themes whichever role is picked.

## Enforcement

`lint/no-adhoc-typography.ts` fails `./singularity check` on raw named font
sizes (`text-{xs,sm,base,lg,xl,2xl…}`) and `leading-*` in any class-name
context — reach for `<Text variant>` instead. The walk also catches a banned
class in an **object/array map indexed directly in a class context** (e.g.
`cn(TONE[tone])`) — but not a bare string `const`. The rule enforces repo-wide with
no `ignores` allowlist; the legacy offenders were all migrated. A genuinely
fixed raw size escapes per-site via
`// eslint-disable-next-line text/no-adhoc-typography -- reason`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Semantic typography primitive: <Text variant tone as> picks a frozen size/line-height/weight role from the typography token group (incl. the eyebrow/section-label role). The single sanctioned home for text hierarchy; raw text-size/leading-* is banned by no-adhoc-typography.
- Web:
  - Uses: `primitives/css/ui-kit.cn`, `primitives/css/ui-kit.textStepFor`, `primitives/css/ui-kit.useControlSize`, `primitives/css/ui-kit.useSingleLine`
  - Exports: Types: `SectionLabelProps`, `TextProps`, `TextTone`, `TextVariant`, `TruncateSide`; Values: `SectionLabel`, `Text`
- Cross-plugin:
  - Imported by: `active-data/plugin-link`, `active-data/task`, `apps-core/layout`, `apps-core/surface/floating`, `apps-core/surface/floating/wallpaper`, `apps-core/surface/floating/wallpaper/from-url`, `apps-core/surface/floating/wallpaper/upload`, `apps/agent-manager/shell`, `apps/agent-manager/welcome`, `apps/agent-manager/worktree-switcher`, `apps/browser/bookmarks`, `apps/browser/start-page`, `apps/browser/tabs`, `apps/browser/webview`, `apps/deploy/servers`, `apps/home/shell`, `apps/mail/inbox`, `apps/mail/reading-pane`, `apps/mail/search`, `apps/mail/shell`, `apps/mail/sync-status`, `apps/mail/thread-list`, `apps/pages/history`, `apps/pages/page-tree`, `apps/pages/welcome`, `apps/pages/welcome/quick-create`, `apps/pages/welcome/recent-pages`, `apps/prototypes/gallery`, `apps/sonata/audio/metronome`, `apps/sonata/library`, `apps/sonata/piano-roll`, `apps/sonata/playback-history`, `apps/sonata/primitives/jog-wheel`, `apps/sonata/progress/scrubber`, `apps/sonata/progress/sections`, `apps/sonata/rich/chord-progression`, `apps/sonata/rich/chord-readout`, `apps/sonata/rich/key-readout`, `apps/sonata/rich/rhythm-controls`, `apps/sonata/rich/voicing-controls`, `apps/sonata/shell`, `apps/sonata/songsheet`, `apps/sonata/sources/midi`, `apps/sonata/sources/ultimate-guitar`, `apps/sonata/track-mixer`, `apps/sonata/transport-bar`, `apps/sonata/transpose`, `apps/story/content/text`, `apps/story/pages-integration`, `apps/story/render`, `apps/story/renderers/blog`, `apps/story/renderers/slides`, `apps/studio/compositions`, `apps/studio/contributions`, `apps/studio/contributions/tables/foreign-keys`, `apps/studio/contributions/tables/row-count`, `apps/studio/explorer`, `apps/studio/graph`, `apps/studio/release`, `apps/studio/release/release-artifact`, `apps/studio/release/release-info`, `apps/studio/release/release-logs`, `apps/website/blog/pages-integration`, `apps/website/blog/site`, `apps/website/demos/agent-run`, `apps/website/demos/app-gallery`, `apps/website/demos/plugin-pyramid`, `apps/website/demos/release-switcher`, `apps/website/demos/sample-app`, `apps/website/demos/theme-toy`, `apps/website/downloads`, `apps/website/landing/cta`, `apps/website/landing/hero`, `apps/website/landing/pillars`, `apps/website/pillars/agents`, `apps/website/pillars/apps`, `apps/website/pillars/platform`, `apps/website/shell`, `apps/workflows/definitions`, `apps/workflows/editor`, `apps/workflows/engine`, `apps/workflows/executions`, `apps/workflows/steps/branch`, `apps/workflows/steps/http-request`, `apps/workflows/steps/llm-prompt`, `apps/workflows/steps/set-value`, `apps/workflows/steps/template`, `apps/workflows/steps/user-input`, `auth`, `auth/apple-signing/setup-wizard`, `auth/google/setup-wizard`, `backup`, `build`, `build/build-info`, `build/build-logs`, `code-explorer`, `code-explorer/file-resolve`, `config_v2/config-link`, `config_v2/fields`, `config_v2/settings`, `config_v2/staging`, `conversations/agents`, `conversations/all-conversations`, `conversations/conversation-preprompt`, `conversations/conversation-ui/item`, `conversations/conversation-view`, `conversations/conversation-view/allow-monitor`, `conversations/conversation-view/branch`, `conversations/conversation-view/code/docs-button`, `conversations/conversation-view/code/file-pane`, `conversations/conversation-view/code/file-pane/markdown`, `conversations/conversation-view/commits-graph`, `conversations/conversation-view/dependencies`, `conversations/conversation-view/jsonl-viewer`, `conversations/conversation-view/jsonl-viewer/assistant-text`, `conversations/conversation-view/jsonl-viewer/assistant-thinking`, `conversations/conversation-view/jsonl-viewer/attachment`, `conversations/conversation-view/jsonl-viewer/attachment/agent-listing-delta`, `conversations/conversation-view/jsonl-viewer/attachment/command-permissions`, `conversations/conversation-view/jsonl-viewer/attachment/date-change`, `conversations/conversation-view/jsonl-viewer/attachment/deferred-tools-delta`, `conversations/conversation-view/jsonl-viewer/attachment/hook-additional-context`, `conversations/conversation-view/jsonl-viewer/attachment/hook-error`, `conversations/conversation-view/jsonl-viewer/attachment/hook-success`, `conversations/conversation-view/jsonl-viewer/attachment/nested-memory`, `conversations/conversation-view/jsonl-viewer/attachment/skill-listing`, `conversations/conversation-view/jsonl-viewer/attachment/task-reminder`, `conversations/conversation-view/jsonl-viewer/code-listing`, `conversations/conversation-view/jsonl-viewer/collapsible-card`, `conversations/conversation-view/jsonl-viewer/event-counter`, `conversations/conversation-view/jsonl-viewer/fields-card`, `conversations/conversation-view/jsonl-viewer/file-path`, `conversations/conversation-view/jsonl-viewer/message-toc`, `conversations/conversation-view/jsonl-viewer/meta-prompt`, `conversations/conversation-view/jsonl-viewer/preprompt`, `conversations/conversation-view/jsonl-viewer/queued-prompt-card`, `conversations/conversation-view/jsonl-viewer/summary`, `conversations/conversation-view/jsonl-viewer/teammate-message`, `conversations/conversation-view/jsonl-viewer/tool-call`, `conversations/conversation-view/jsonl-viewer/tool-call/add-task`, `conversations/conversation-view/jsonl-viewer/tool-call/agent`, `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`, `conversations/conversation-view/jsonl-viewer/tool-call/bash`, `conversations/conversation-view/jsonl-viewer/tool-call/edit`, `conversations/conversation-view/jsonl-viewer/tool-call/flag-raise`, `conversations/conversation-view/jsonl-viewer/tool-call/read`, `conversations/conversation-view/jsonl-viewer/tool-call/skill`, `conversations/conversation-view/jsonl-viewer/tool-call/task-tools`, `conversations/conversation-view/jsonl-viewer/tool-call/workflow`, `conversations/conversation-view/jsonl-viewer/tool-call/write`, `conversations/conversation-view/jsonl-viewer/unknown`, `conversations/conversation-view/jsonl-viewer/user-image`, `conversations/conversation-view/jsonl-viewer/user-text`, `conversations/conversation-view/op-status`, `conversations/conversation-view/pending-turn`, `conversations/conversation-view/push-profiling`, `conversations/conversation-view/turn-summary`, `conversations/conversations-view`, `conversations/conversations-view/grouped`, `conversations/conversations-view/history`, `conversations/conversations-view/queue`, `conversations/recover`, `conversations/summary`, `debug/boot-profile`, `debug/broadcasts`, `debug/claude-cli-calls`, `debug/health-monitor`, `debug/heap-snapshot`, `debug/live-state-churn/emit`, `debug/live-state-health`, `debug/memory`, `debug/profiling`, `debug/profiling/boot`, `debug/profiling/push`, `debug/profiling/runtime`, `debug/queue`, `debug/read-set`, `debug/render-profiler`, `debug/reports`, `debug/slow-ops/cluster`, `debug/slow-ops/pane`, `debug/trace/contention`, `debug/trace/engine`, `debug/trace/gates`, `debug/trace/pane`, `debug/trace/spans`, `debug/trace/stall`, `debug/worktree-cleanup`, `debug/zero-test`, `fields/color/table`, `fields/date/filter`, `fields/dynamic-enum/config`, `fields/enum/column-config`, `fields/enum/config`, `fields/json/config`, `fields/list/config`, `fields/number/filter`, `fields/object/config`, `fields/reorder-tree/config`, `fields/secret/config`, `fields/string-list/config`, `fields/variant/config`, `framework/web-core`, `history/dialog`, `improve/element-picker`, `infra/events-test`, `layouts/route-fallback`, `page/bookmark`, `page/callout`, `page/editor`, `page/embed`, `page/file`, `page/formatting/color`, `page/inline-date`, `page/links`, `page/math/equation`, `page/math/inline`, `page/read-only-view`, `page/sub-page`, `plugin-meta/facets/contributions/render-detail`, `plugin-meta/facets/cross-refs/render-detail`, `plugin-meta/facets/db-schema/render-detail`, `plugin-meta/facets/exports/render-detail`, `plugin-meta/facets/registrations/render-detail`, `plugin-meta/facets/resources/render-detail`, `plugin-meta/facets/routes/render-detail`, `plugin-meta/facets/slots/render-detail`, `plugin-meta/plugin-view`, `plugin-meta/plugin-view/dependencies`, `plugin-meta/plugin-view/inclusion`, `plugin-meta/plugin-view/sub-plugins`, `primitives/avatar`, `primitives/command-palette`, `primitives/commit-list`, `primitives/css/color-picker`, `primitives/css/layout-harness`, `primitives/data-table`, `primitives/data-view`, `primitives/data-view/custom-columns`, `primitives/data-view/gallery`, `primitives/data-view/list`, `primitives/data-view/table`, `primitives/data-view/view-core`, `primitives/diff-view`, `primitives/error-boundary`, `primitives/filter-chips`, `primitives/folder-picker`, `primitives/graph-canvas`, `primitives/icon-picker`, `primitives/launch`, `primitives/markdown`, `primitives/pane`, `primitives/rank-reorder`, `reorder`, `reorder/edit-mode`, `reorder/editor`, `reorder/node-types/header`, `review/code-review`, `review/config-defaults`, `review/plugin-changes`, `review/plugin-changes/api-changes`, `review/plugin-changes/file-changes`, `screenshot`, `screenshot/draw-on-app`, `search/quick-find`, `shell/notifications`, `stats`, `stats/commits`, `stats/cost`, `stats/pushes`, `stats/tasks`, `tasks/attempt-view`, `tasks/task-attachments`, `tasks/task-dependencies`, `tasks/task-description`, `tasks/task-draft-form`, `tasks/task-effort`, `tasks/task-events`, `tasks/task-graph`, `tasks/task-header`, `tasks/task-preprompt`, `tasks/task-status`, `ui/segmented-progress-bar`, `ui/segmented-progress-bar/dots`, `ui/tab-bar/chip`, `ui/tab-bar/connected`, `ui/tab-bar/customizer`, `ui/tab-bar/underline`, `ui/theme-engine/theme-customizer`, `ui/tokens/categorical`, `ui/tokens/chart`, `ui/tokens/color-palette`, `ui/tokens/density`, `ui/tokens/font-family`, `ui/tokens/shadow`, `ui/tokens/shape`, `ui/tokens/sidebar-palette`, `ui/tokens/type-scale`, `ui/tweakcn/community-browser`, `ui/variant-region`

<!-- AUTOGENERATED:END -->

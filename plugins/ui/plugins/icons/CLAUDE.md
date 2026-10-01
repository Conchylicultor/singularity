# icons

Every icon in code is a **Material Symbols** glyph, named as data and drawn in
the style its theme scope picks. Plan and rationale:
[`research/2026-09-27-global-material-symbols-icons.md`](../../../../research/2026-09-27-global-material-symbols-icons.md).

```ts
import { symbol, brand, type IconRef } from "@plugins/ui/plugins/icons/core"; // any runtime
import { Icon } from "@plugins/ui/plugins/icons/web";

const forumIcon = symbol("forum");         // { kind: "symbol", name: "forum" }
const githubIcon = brand("github");        // { kind: "brand",  name: "github" }

<Icon icon={forumIcon} className="size-4" />
<Icon icon={pinIcon} active={pinned} />    // the theme's active fill (filled by default)
```

## The rules

- **An icon is data.** A slot takes `icon: IconRef`; its host draws it with
  `<Icon icon={item.icon} …/>`. Never a component, never a variant: `Outline`,
  `Rounded`, filled/unfilled pairs are the theme's choice, or `active`'s.
- **Names.** `SymbolName` is the base name (kebab-case, as on
  fonts.google.com/icons) of every symbol drawn in AT LEAST ONE of the 12
  styles (3 shapes × 2 fills × regular/light), deprecated ones included (the
  classic `auto-awesome`, `insights`). An unknown name is a tsc error. A base
  is a key with its style suffix stripped only when the stripped name is itself
  a key, so `error-circle-rounded` stays a base and invents no `error-circle`.
- **Missing styles fall back** (`resolveSymbolStyle`, core): a style that
  lacks the name draws the nearest style that has it — keep the **fill** first
  (it carries `active`; a filled-only icon draws filled at rest), then the
  **weight**, then the **shape** (the requested one, else `default`). The
  sprite builder applies it, so `ms-<K>-<name>` in sprite K is already the
  resolved drawing and `<Icon>` has no fallback of its own; `symbolBody` (the
  release CLI's app icon) applies the same rule. `BrandName` is a Simple Icons slug. Both are generated into
  `core/symbol-names.generated.ts` by `scripts/gen-symbol-names.ts`; rerun it
  after upgrading an `@iconify-json/*` package (`icons:symbol-names-in-sync`).
- **Literal names only.** `symbol("…")` / `brand("…")` take a string literal,
  imported under their own name and only ever called
  (lint `icons/literal-icon-name`). The build scans those literals into the
  icon manifest (`codegen/core/icon-manifest-gen.ts`, a pre-barrel manifest;
  `icons:manifest-in-sync`), and the sprites ship exactly the manifest — a
  name the scan cannot see would draw an empty box. The manifest sits beside
  its one reader, `plugins/sprites/server/internal/icon-manifest.generated.ts`,
  not in `core/`: the CLI loads the core barrel (through this plugin's checks)
  in the process that regenerates the manifest, which would freeze it.
- `<Icon>` is an `<svg viewBox="0 0 24 24" width="1em" height="1em">` holding
  `<use href="#<id>">`, so `size-*` classes and `[&_svg]:…` rules size it as
  before. Hidden from assistive tech unless it has `title` / `aria-label` /
  `aria-labelledby`; every other svg prop passes through.

## How a style is chosen

The style axes are the `icons` token group
(`plugins/ui/plugins/tokens/plugins/icons`): `iconShape` (default | rounded |
sharp), `iconFill` (outline | filled), `iconActiveFill` (filled | outline),
`iconStroke` (regular = Material Symbols 400 | light = Material Symbols Light
300; not `iconWeight`, which `type-scale:closed-role-ladder` reads as a type
metric). Default: outline, filled when active. One combination is a **style key**
(`default-outline-400`); a symbol's sprite id is `ms-<styleKey>-<name>`, a
brand's `si-<name>`.

**This plugin knows no theme — on purpose.** It sits BELOW the ui-kit (whose
close/chevron/check icons it will draw), so it cannot import the theme engine,
the ui-kit or live-state, which sit above it; an import either way would be a
cycle. So the pieces around it are wired in, not imported:

- **Which scope an icon is in** — `IconScopeProvider`, rendered by every
  `<Theme>` boundary (`primitives/css/theme-boundary`) with its scope token. It
  is React context, so it crosses portals like the theme does. (A sub-theme's
  popups keep the sub-theme's icon style — the region-only forward is a DOM
  attribute concern the icon scope does not mirror.)
- **What each scope says** — `usePublishIconStyle(scope, style)`, called by the
  token group's `IconThemeBridge` (a `Core.Root`) for the root (`:root`), each
  app with its own theme document, each fixed theme and each sub-theme that
  names the group. A scope with no entry uses the root's, as its CSS inherits
  `:root`; before anything is published the default applies. One publisher per
  scope — a second throws.
- **Sprites** — the `sprites` sub-plugin fills the sprite store
  (`provideSprite`) and mounts `IconSpriteSheet`, an inline hidden container of
  one `<svg>` per sprite, so `<use href="#id">` resolves in-document (portals
  and Fullscreen subtrees included).

Until the wanted style's sprite has loaded, `<Icon>` draws the **default
style's** symbol: the same glyph in the global style, in the same box — the
default sprites are resident from first paint.

## Sprites (`plugins/sprites`)

- **Server** builds each sprite from `@iconify-json/material-symbols` (400) or
  `@iconify-json/material-symbols-light` (300) — all 12 sprites in one pass
  over both sets (a fallback may cross weights), memoized; the sets are parsed
  once per process and dropped — plus a `brands` sprite from `@iconify-json/simple-icons`.
- **Resident**: `icons.sprites` (a `liveValue`, `preload: "boot-and-keep"`)
  carries the default style's two sprites and the brands, with the
  `manifestHash`. The boot snapshot hydrates it, so the sheet is in the first
  commit.
- **On demand**: a style some scope wants that is not resident is fetched from
  `GET /api/icons/sprite/:hash/:key` (the typed `spriteEndpoint`) — immutable
  for its URL; a hash that is not the server's current one is refused (409),
  never answered with bytes the URL does not name. A failed fetch is
  thrown into the host's error boundary.

## Runtime symbols (saved icons)

An icon a USER picked and something stored (an agent avatar, a callout
icon, a configured category avatar) is a Material Symbols name and nothing else —
`SavedSymbolName`, minted only by `SavedSymbolNameSchema` (`plugins/saved-names`,
a membership parse against the installed sets, used by every store: request
bodies, DB columns, config, block data). Its name is not in the build's
manifest, so the sprites do not carry it:

```ts
import { runtimeSymbol } from "@plugins/ui/plugins/icons/core";
<Icon icon={runtimeSymbol(agent.icon)} />   // { kind: "runtime-symbol", name }
```

- `runtimeSymbol` is its own constructor (not `symbol`), outside
  `icons/literal-icon-name` by construction.
- `<Icon>` asks the **runtime symbol store** (`web/internal/runtime-symbol-store.ts`)
  for (style key, name). Chunks of `<symbol id="msr-<styleKey>-<name>">` are
  appended to the sheet (their own id prefix, so a name also in the manifest
  never yields two elements with one id).
- **Resident at boot:** `icons.saved-sprites` (sprites plugin, `boot-and-keep`)
  carries the default style's drawing of every name a saved-icon source
  reports. A source is `defineSavedIconSource({ id, names, watch? })` (sprites
  server barrel; the sprites plugin knows no source): DB-backed ones read
  through `db` so their tables' changes recompute the value (agents, callout
  blocks, preprompt launch snapshots), config ones pass `watch`
  (conversation-category, preprompts).
- **On demand:** a name/style no chunk holds is a want; the sprites plugin's
  loader batches every want of a frame into one
  `GET /api/icons/symbols/:hash/:key?names=a,b` per style (sorted, so
  content-addressed and immutable; unknown name 404, stale hash 409) and a
  failed batch throws into its error boundary.
- **Fallback:** while the wanted style's symbol loads `<Icon>` draws the default
  style's symbol for the same name, like a code icon — so a theme switch never
  blanks a saved icon. Only a name with no drawing in any style yet renders an
  empty box at its final size (a loading state).
- **Theme changes are live:** only the name is stored and the style key is
  resolved from the scope at render, so saved icons restyle with their scope.

A page icon is NOT a saved symbol: it is an emoji (`plugins/emoji`,
`EmojiSchema`), drawn as a glyph by `<EmojiGlyph>` in an icon-sized box.

## Deviations from the plan

- The plan had `<Icon>` resolve the scope with theme-engine's
  `useThemeScopeId()` + `useResolvedTheme()`. `useThemeScopeId` is the
  customizer's editing scope (undefined everywhere else), and any theme-engine
  import from here closes a cycle once the ui-kit draws `<Icon>`. Hence the
  leaf + publish/scope-context split above.
- The sprite route and resident value live in the `sprites` sub-plugin, not in
  this plugin's `server/`, for the same reason: `core/` stays import-free so
  every runtime (and every `core/` file of every plugin) can name an icon.
- The manifest is not in `core/` (see "The rules"), and the weight token is
  `iconStroke`, not `iconWeight` (a `-weight` var is a type metric).
- On-demand sprites use the path `/:hash/:key`, not `?v=`, so the typed
  endpoint (`spriteEndpoint`, a blob) carries the version as a param.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Draws icons: <Icon icon={symbol(…)} active?/> renders an IconRef from the page's inline SVG sprites in its theme scope's icon style. A leaf below the ui-kit — it knows no theme: the icons token group publishes each scope's style (usePublishIconStyle), <Theme> boundaries say which scope an icon is in (IconScopeProvider), and the sprites plugin fills and mounts the sheet. Reads glyphs out of the installed Iconify JSON: resolveIcon (a name in a set, aliases followed), resolveSymbol (the icon drawing a symbol in a style, after the nearest-style fallback) and symbolBody (one Material Symbols glyph in a style, for a consumer with no sprite sheet — the release CLI's app icon).
- Cross-plugin:
  - Imported by:
    - `active-data/commit-link`
    - `active-data/plugin-link`
    - `active-data/prototype`
    - `apps-core/app-icon`
    - `apps-core/surface`
    - `apps-core/surface/floating`
    - `apps-core/surface/floating/wallpaper`
    - `apps-core/surface/floating/wallpaper/upload`
    - `apps/agent-manager/welcome`
    - `apps/browser/shell`
    - `apps/browser/start-page`
    - `apps/browser/webview`
    - `apps/chord/curriculum`
    - `apps/chord/trainer`
    - `apps/deploy/composition`
    - `apps/deploy/deployments`
    - `apps/deploy/remote-deploy`
    - `apps/deploy/ssh-setup`
    - `apps/events/event-list`
    - `apps/events/shell`
    - `apps/events/sources`
    - `apps/events/sources/source-detail/runs`
    - `apps/home/app-cards`
    - `apps/mail/attachments`
    - `apps/mail/reading-pane`
    - `apps/mail/search`
    - `apps/mail/shell`
    - `apps/mail/sync-status`
    - `apps/mail/threads`
    - `apps/pages/auto-icon`
    - `apps/pages/content-search`
    - `apps/pages/page-author`
    - `apps/pages/page-tree`
    - `apps/pages/prompt-origin`
    - `apps/pages/trash`
    - `apps/pages/welcome/quick-create`
    - `apps/pages/welcome/recent-pages`
    - `apps/prototypes/canvas`
    - `apps/prototypes/gallery`
    - `apps/prototypes/present`
    - `apps/prototypes/thumbnails`
    - `apps/sonata/library`
    - `apps/sonata/piano-roll`
    - `apps/sonata/progress/loop`
    - `apps/sonata/sources/chord-grid`
    - `apps/sonata/sources/midi`
    - `apps/sonata/sources/ultimate-guitar`
    - `apps/sonata/track-mixer`
    - `apps/sonata/transport-bar`
    - `apps/sonata/transpose`
    - `apps/sonata/view-options`
    - `apps/studio/compositions`
    - `apps/studio/compositions/draft-actions`
    - `apps/studio/compositions/entry-points`
    - `apps/studio/compositions/release`
    - `apps/studio/compositions/release/release-artifact`
    - `apps/studio/contributions`
    - `apps/studio/explorer/collapsed`
    - `apps/studio/explorer/excluded`
    - `apps/studio/explorer/load-bearing`
    - `apps/website/improve`
    - `apps/website/landing/contact`
    - `apps/website/landing/layers`
    - `apps/website/pages/download`
    - `apps/website/shell`
    - `auth`
    - `auth/apple-signing/setup-wizard`
    - `backup`
    - `backup/runs-arm`
    - `build`
    - `build/build-fix`
    - `build/build-logs`
    - `build/deployment`
    - `code-explorer`
    - `config_v2/settings`
    - `config_v2/settings/conflict-agent`
    - `conversations/agents`
    - `conversations/conversation-view/allow-monitor`
    - `conversations/conversation-view/artifacts`
    - `conversations/conversation-view/branch`
    - `conversations/conversation-view/commits-graph`
    - `conversations/conversation-view/dependencies`
    - `conversations/conversation-view/drop-and-exit`
    - `conversations/conversation-view/drop-dependents`
    - `conversations/conversation-view/exit`
    - `conversations/conversation-view/exit-menu`
    - `conversations/conversation-view/fork-conversation`
    - `conversations/conversation-view/hold-and-exit`
    - `conversations/conversation-view/jsonl-viewer`
    - `conversations/conversation-view/jsonl-viewer/assistant-text`
    - `conversations/conversation-view/jsonl-viewer/attachment/date`
    - `conversations/conversation-view/jsonl-viewer/attachment/harness-nudge`
    - `conversations/conversation-view/jsonl-viewer/attachment/hook-message`
    - `conversations/conversation-view/jsonl-viewer/attachment/model`
    - `conversations/conversation-view/jsonl-viewer/attachment/queued-command`
    - `conversations/conversation-view/jsonl-viewer/attachment/remote-session`
    - `conversations/conversation-view/jsonl-viewer/attachment/session-mode`
    - `conversations/conversation-view/jsonl-viewer/attachment/team-context`
    - `conversations/conversation-view/jsonl-viewer/attachment/tool-output-notice`
    - `conversations/conversation-view/jsonl-viewer/investigate-event`
    - `conversations/conversation-view/jsonl-viewer/meta-prompt`
    - `conversations/conversation-view/jsonl-viewer/preprompt`
    - `conversations/conversation-view/jsonl-viewer/queue-operation`
    - `conversations/conversation-view/jsonl-viewer/queued-prompt-card`
    - `conversations/conversation-view/jsonl-viewer/row-actions`
    - `conversations/conversation-view/jsonl-viewer/subagents`
    - `conversations/conversation-view/jsonl-viewer/system`
    - `conversations/conversation-view/jsonl-viewer/tool-call/agent`
    - `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`
    - `conversations/conversation-view/jsonl-viewer/tool-call/flag-raise`
    - `conversations/conversation-view/jsonl-viewer/tool-call/page-tools`
    - `conversations/conversation-view/jsonl-viewer/tool-call/skill`
    - `conversations/conversation-view/jsonl-viewer/tool-call/task-tools`
    - `conversations/conversation-view/jsonl-viewer/tool-call/workflow`
    - `conversations/conversation-view/jsonl-viewer/transcript-stats`
    - `conversations/conversation-view/jsonl-viewer/user-text`
    - `conversations/conversation-view/launch-prompts`
    - `conversations/conversation-view/new-child-task`
    - `conversations/conversation-view/op-status`
    - `conversations/conversation-view/prompt-templates`
    - `conversations/conversation-view/push-and-exit`
    - `conversations/conversation-view/rewind`
    - `conversations/conversation-view/running-agents`
    - `conversations/conversation-view/tasks-panel`
    - `conversations/conversation-view/terminal-pane`
    - `conversations/conversation-view/turn-summary`
    - `conversations/conversations-view`
    - `conversations/preprompts`
    - `conversations/recover`
    - `conversations/summary`
    - `debug/boot-profile`
    - `debug/broadcasts`
    - `debug/claude-cli-calls`
    - `debug/config-orphans`
    - `debug/live-state-churn/emit`
    - `debug/op-rate`
    - `debug/profiling`
    - `debug/queue`
    - `debug/render-profiler`
    - `debug/reports`
    - `debug/slow-ops`
    - `debug/slow-ops/pane`
    - `debug/stall-monitor`
    - `debug/stuck-spans`
    - `debug/trace/pane`
    - `debug/trace/spans`
    - `debug/worktree-cleanup`
    - `fields/avatar`
    - `fields/avatar/config`
    - `fields/bool`
    - `fields/bool/inline`
    - `fields/bool/table`
    - `fields/color`
    - `fields/date`
    - `fields/date/filter`
    - `fields/directory-path`
    - `fields/dynamic-enum`
    - `fields/enum`
    - `fields/enum/column-config`
    - `fields/float`
    - `fields/image`
    - `fields/int`
    - `fields/json`
    - `fields/list`
    - `fields/multiline-text`
    - `fields/number`
    - `fields/object`
    - `fields/rank`
    - `fields/reorder-tree`
    - `fields/secret`
    - `fields/secret/config`
    - `fields/string-list`
    - `fields/tags`
    - `fields/text`
    - `fields/uuid`
    - `fields/variant`
    - `fullscreen`
    - `improve`
    - `infra/events-test`
    - `layouts/miller`
    - `page/annotations/agent-notes`
    - `page/annotations/human-notes`
    - `page/annotations/instructions`
    - `page/annotations/instructions/instructions-page`
    - `page/annotations/private-notes`
    - `page/annotations/todo`
    - `page/attachment-block`
    - `page/audio`
    - `page/bookmark`
    - `page/bulleted-list`
    - `page/callout`
    - `page/code-block`
    - `page/divider`
    - `page/editor`
    - `page/embed`
    - `page/file`
    - `page/formatting/link`
    - `page/heading/heading-1`
    - `page/heading/heading-2`
    - `page/heading/heading-3`
    - `page/image`
    - `page/inline-date`
    - `page/map`
    - `page/math/equation`
    - `page/numbered-list`
    - `page/open-as-page`
    - `page/page-link`
    - `page/place`
    - `page/place/map-layer`
    - `page/prompt/block`
    - `page/quote`
    - `page/read-only-view`
    - `page/table`
    - `page/text`
    - `page/to-do`
    - `page/toggle`
    - `page/turn-into-page`
    - `page/url-paste`
    - `page/video`
    - `plugin-meta/facets/structure/render-detail`
    - `plugin-meta/plugin-view`
    - `plugin-meta/plugin-view/inclusion`
    - `plugin-meta/plugin-view/sub-plugins`
    - `primitives/action-presentation`
    - `primitives/app-shell`
    - `primitives/avatar`
    - `primitives/breadcrumb`
    - `primitives/collapsible`
    - `primitives/command-palette`
    - `primitives/copy-to-clipboard`
    - `primitives/css/control-panel`
    - `primitives/css/spinner`
    - `primitives/css/theme-boundary`
    - `primitives/css/ui-kit`
    - `primitives/data-table`
    - `primitives/data-view`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/gallery`
    - `primitives/data-view/tree`
    - `primitives/data-view/view-core`
    - `primitives/date-picker`
    - `primitives/detail-sections`
    - `primitives/dom/auto-scroll`
    - `primitives/expandable`
    - `primitives/folder-picker`
    - `primitives/icon-button`
    - `primitives/icon-picker`
    - `primitives/launch`
    - `primitives/overlay/image-viewer`
    - `primitives/pane`
    - `primitives/search`
    - `primitives/setup-steps`
    - `primitives/sync-status`
    - `primitives/text-editor/composer`
    - `primitives/text-editor/composer/picker-pill`
    - `primitives/text-editor/inline-chip`
    - `primitives/text-editor/paste-images`
    - `primitives/tree`
    - `primitives/ui-context/element-picker`
    - `primitives/view-switcher`
    - `reorder`
    - `reorder/edit-mode`
    - `reorder/editor`
    - `reorder/node-types/overflow`
    - `reports/launch-fix`
    - `review`
    - `review/code-review`
    - `review/plugin-changes`
    - `review/plugin-changes/api-changes`
    - `screenshot`
    - `shell/health-report`
    - `shell/toast`
    - `tasks/attempt-view`
    - `tasks/task-deps-tree`
    - `tasks/task-draft-form`
    - `tasks/task-events`
    - `tasks/task-graph`
    - `tasks/task-status`
    - `ui/breadcrumb-separator/chevron`
    - `ui/icons/emoji`
    - `ui/icons/sprites`
    - `ui/tab-bar`
    - `ui/theme-engine/quick-theme`
    - `ui/theme-engine/theme-customizer`
    - `ui/theme-toggle`
    - `ui/tokens/icons`
    - `ui/tokens/shadow`
- Web:
  - Exports (types):
    - `IconProps`
    - `RuntimeSymbolEntry`
  - Exports (values):
    - `hasRuntimeSymbol`
    - `hasSprite`
    - `Icon`
    - `IconScopeProvider`
    - `IconSpriteSheet`
    - `installRuntimeSymbolLoader`
    - `provideRuntimeSymbols`
    - `provideSprite`
    - `useIconStyle`
    - `usePublishIconStyle`
    - `useWantedStyleKeys`
- Server:
  - Exports (types):
    - `IconBody`
    - `SymbolSets`
  - Exports (values):
    - `resolveIcon`
    - `resolveSymbol`
    - `symbolBody`
- Core:
  - Exports (types):
    - `BrandName`
    - `BrandRef`
    - `IconFill`
    - `IconRef`
    - `IconShape`
    - `IconStyle`
    - `IconWeight`
    - `RuntimeSymbolRef`
    - `SavedSymbolName`
    - `SpriteKey`
    - `StyleKey`
    - `SymbolName`
    - `SymbolRef`
  - Exports (values):
    - `ALL_STYLE_KEYS`
    - `brand`
    - `brandId`
    - `BRANDS_SPRITE`
    - `coveredStyles`
    - `DEFAULT_ICON_STYLE`
    - `DEFAULT_STYLE_KEYS`
    - `ICON_FILLS`
    - `ICON_SHAPES`
    - `ICON_WEIGHTS`
    - `iconifyName`
    - `isStyleKey`
    - `parseStyleKey`
    - `resolveSymbolStyle`
    - `runtimeSymbol`
    - `runtimeSymbolId`
    - `styleKeyOf`
    - `symbol`
    - `symbolId`
- Shared:
  - Exports (types): `SymbolNameList`
  - Exports (values):
    - `brandNames`
    - `ICON_SET_PACKAGES`
    - `installedSetVersions`
    - `readIconSet`
    - `readInputsHash`
    - `readListInputsHash`
    - `renderSymbolNameList`
    - `renderSymbolNames`
    - `SYMBOL_NAME_LIST_REL_PATH`
    - `SYMBOL_NAMES_REL_PATH`
    - `symbolBaseNames`
    - `symbolNamesInputsHash`
- Sub-plugins:
  - **`emoji`** — The <EmojiPicker>: a searchable, categorized emoji grid over frimousse whose emojibase data is served same-origin by the asset mirror; onSelect hands back a parsed Emoji. Plus <EmojiGlyph>, which draws an emoji in an icon's box (sized by the same size-* class). The page icon picker and <PageIcon> compose them. Registers the emojibase data mirror so the emoji picker's data is served same-origin (offline-capable after one warm-up) rather than fetched from the CDN by the browser.
  - **`saved-names`** — The membership-checked SavedSymbolName: a user-picked Material Symbols name, parsed against the installed sets before anything stores it.
  - **`sprites`** — Mounts the page's icon sprites inline: the resident default-style sprites from the boot snapshot (present at first paint) plus, on demand, the sprite of every other style a theme scope picks. Builds the icon sprites from the Iconify JSON for the manifest's names — one <svg> of <symbol id="ms-<styleKey>-<name>"> per style key (material-symbols at 400, material-symbols-light at 300) plus a brands sprite — and serves the default style's as the resident icons.sprites value and every one at GET /api/icons/sprite/:hash/:key, immutable. Saved (user-picked) icons are runtime symbols: the resident icons.saved-sprites value draws every name a defineSavedIconSource source reports in the default style, and GET /api/icons/symbols/:hash/:key?names= serves any saved names in any style, immutable.

<!-- AUTOGENERATED:END -->

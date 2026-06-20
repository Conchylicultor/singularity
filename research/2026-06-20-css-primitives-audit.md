# CSS Primitives Audit & Composition Guide

**Date:** 2026-06-20
**Scope:** Every CSS/layout primitive under `plugins/primitives/plugins/css/plugins/*` plus the layout-relevant primitives that live one level up (`bar`, `truncating-text`, `viewport-overlay`, `responsive-overflow`). Covers the mental model, the full primitive taxonomy with exact APIs, the canonical composition recipes, the enforcement rules, and a set of rough edges found during the audit.

This is the deep reference behind the always-loaded [`css` skill](../.claude/skills/css/SKILL.md). The skill is the one-screen map; this doc is the audit. For tokens/color/presets see the [`theme` skill](../.claude/skills/theme/SKILL.md). Design-rationale companions: [layout primitive APIs](./2026-06-15-global-css-layout-primitive-apis.md), [vision](./2026-06-15-global-css-layout-primitives-vision.md), [drain plan](./2026-06-17-global-drain-no-adhoc-layout-allowlist.md).

---

## 1. The mental model

> **Write the role, not the mechanics; let the container own the policy.**

Six load-bearing principles. They are the *whole* point — every primitive below is an instance of one of them.

1. **One job per box.** A box is either a **container** (arranges children: declares direction + how slack is shared) or a **content leaf** (sizes to itself: rigid, flexible, or truncating). Fusing both onto one `<div className="flex … min-w-0 truncate">` is the root of the entire layout-bug class.

2. **Space-sharing is a container property, declared once.** The container names its tracks. Children do *not* each sprinkle `min-w-0`/`shrink-0`/`flex-1` and hope the negotiation converges.

3. **The shrink hierarchy is explicit and total.** For any row that can overflow, "what gives first?" has one answer in one place: rigid identity (chips/icons) never shrinks → secondary metadata truncates first → primary content truncates last.

4. **Prefer the layout mode where the bug is unrepresentable.** `rigid | flexible | rigid` is canonical CSS Grid (`auto minmax(0,1fr) auto`). An `auto` track cannot collapse under its own rigid content, so "container crushed by its own chip" *cannot happen by construction*. Choose the mode that forbids the bug over the one that merely lets you avoid it.

5. **`min-width: 0` is a deliberate leaf decision, never a container reflex.** The whole historical churn was `min-w-0` applied at the wrong altitude. Exactly one primitive — the truncation leaf — owns it. (See §8 for the few sanctioned container-level exceptions.)

6. **Semantic intent over mechanics.** You write `content` / `meta` / `stack with sm rhythm`; the primitive owns `flex items-center gap-2 min-w-0 …` and can therefore fix it once, globally.

### The two recurring bug shapes (read before hand-rolling any row)

Two boxes overlap when one lands in a region the engine never reserved *for it* — because the boundary was a hint the content can ignore, not a real track.

- **Absolute indicator + reservation padding.** `relative flex … pr-2xl` with a trailing checkmark `absolute right-2`. The `pr-2xl` is only a hint; a growing label slides under the floating indicator. → Use a real rigid track (`Frame` `trailing`, or `grid-cols-[minmax(0,1fr)_auto]` below `Frame`). Never absolute + padding-reservation for a trailing affordance.
- **Rigid leaf in an unclipped flexible cell.** A `flex-1 min-w-0` cell with no overflow clip holding a `shrink-0` child (a `SegmentedControl`, a fixed control): when narrow, the child overflows onto the next sibling. → The cell owns its overflow (`Clip`), or the child yields. Also `flex-1 truncate` *without* `min-w-0` never shrinks (implicit `min-width:auto`) — the `truncate` is dead.

**Layer rule:** no primitive re-derives flex+absolute row layout by hand. *Above* `Frame` in the DAG, compose `Frame`. *At/below* `Frame` (the handful it is itself built on, e.g. `ui-kit`'s shadcn menu items — importing `Frame` there would cycle), write the grid tracks directly. Either way the affordance lives in a track, never floats over the label.

---

## 2. Primitive taxonomy

Eight families. Import path is `@plugins/primitives/plugins/<name>/web`; the `css/*` set lives at `@plugins/primitives/plugins/css/plugins/<name>/web`. Every primitive accepts `ref` (React-19 ref-as-prop), `as` (polymorphic host), and `className` (composed **last** via `cn`/tailwind-merge — caller always wins the conflict).

### A. Flow containers — *declare direction + how slack is shared*

| Primitive | Plugin | Role | Key props (default) | Owns internally |
|---|---|---|---|---|
| **Stack** | `spacing` | 1-D flex flow with ramp gap | `gap`(req) · `direction`(`col`) · `align` · `justify` · `wrap` | `flex flex-col\|row gap-<step>` + optional `items-*`/`justify-*`/`flex-wrap` |
| **Inset** | `spacing` | Padding container | `pad` · `x` · `y` · `t`/`r`/`b`/`l` (all optional) | `p-<step>` cascade (all→axis→side) |
| **Frame** | `css/frame` | Named-slot **row**, baked shrink hierarchy | `leading` · `content` · `meta` · `trailing` · `gap`(`sm`) · `align`(`center`) | `grid` + dynamic `grid-template-columns` |
| **Column** | `css/column` | Named-slot **column** (Frame's vertical twin) | `header` · `body` · `footer` · `scrollBody`(`true`) · `fill`(`false`) · `hideScrollbar` · `gap`(`none`) | `flex flex-col`; header/footer `shrink-0`; body → `Scroll` or `min-h-0 flex-1` |
| **Grid** | `css/grid` | Responsive/uniform card grid | `minCellWidth`(req) · `mode`(`fill`) · `cols` · `gap`(`md`) · `align` · `justify` | `grid` + `repeat(auto-fill\|fit, minmax(min,1fr))` or `repeat(cols, minmax(0,1fr))` |
| **Cluster** | `css/cluster` | Wrapping group of rigid chips | `gap`(`sm`) · `align`(`center`) · `justify` | delegates to `Stack direction=row wrap` |
| **Inline** | `css/inline` | Inline-level row for mid-text chips/icons | `gap`(req) · `align`(`center`) · `justify` · `wrap` · `as`(`span`) | `Stack` + override `inline-flex align-baseline` |
| **Center** | `css/center` | Centering box (grid place-items) | `axis`(`both`) | `grid` + `place-items-center`/`justify-items-center`/`items-center` |

**Frame's grid tracks** (only present slots get a track): `leading`→`auto` · `content`→`minmax(0,max-content)` · `meta`(or inert fill spacer)→`minmax(0,1fr)` · `trailing`→`auto`. Root is always `justify-start` so no-flex shapes left-pack. String `content`/`meta` auto-wrap in `<TruncatingText>`; a ReactNode does **not** — you own its truncation. `FrameAlign` is a subset of `StackAlign` (`center|start|baseline` only — no `end`/`stretch`). When `trailing` is present but `meta` absent, an `aria-hidden` `min-w-0` spacer takes meta's track so trailing stays pinned right — don't suppress it.

**Column's fill policy**: `scrollBody` (default true) wraps body in `<Scroll axis=y fill>`. `scrollBody={false}` → plain `min-h-0 flex-1` (body owns its own overflow, e.g. an embedded data-view). `fill` emits `min-h-0 flex-1` on the **root** so Column fills a flex-col parent. `gap` defaults to `none` (flush) — unusual; most primitives default looser.

### B. Overflow & positioning — *own overflow / establish positioning context*

| Primitive | Plugin | Role | Key props (default) | Owns internally |
|---|---|---|---|---|
| **Scroll** | `css/scroll` | Scroll container + flex-fill, as one role | `axis`(`y`) · `fill` · `hideScrollbar` · `isolate` | `overflow-y-auto overflow-x-hidden` (etc.); `fill`→`min-h-0 flex-1` (y) / `min-w-0 flex-1` (x) |
| **Clip** | `css/clip` | Clip overflow, no scroll (Scroll's sibling) | `axis`(`both`) · `fill` | `overflow-hidden`; `fill`→`min-h-0 flex-1` |
| **Sticky** | `css/sticky` | Pin header/footer to a scroll edge | `active`(`true`) · `edge`(`top`) · `offset`(`none`) · `layer`(`raised`) | `sticky` + `z-<layer>` + inline edge offset (`var(--space-*)`) |
| **Pin** | `css/pin` | Point-anchor a child in a `relative` parent | `to`(req) · `offset`(`none`) · `outset` · `layer`(`raised`) · `decorative` · `stretch` | `absolute` + `z-<layer>` + inline insets / `-translate-*` centering |
| **Overlay** | `css/overlay` | In-flow positioning + full-bleed `behind`/`above` layers | `behind` · `above` · `layer`(`base`) · `clickThrough` · `fill` | root `relative z-<layer>`; layers `absolute inset-0` |
| **ViewportOverlay** | `viewport-overlay` | True `fixed inset-0` portaled to `<body>` | `layer`(`popover`) · `active`(`true`) | `fixed inset-0` + `z-<layer>` + portal + theme-scope forwarding |
| **ResponsiveOverflow** | `responsive-overflow` | Progressively hide children that don't fit width | `children`(array) · `gap`(`4`px) · `constraintRef` | measure-and-slice; ghost div portaled to body |

`Scroll`'s `fill` must never be split — `min-h-0`+`flex-1` are one unit; emitting only `flex-1` re-opens the "pane grows past parent, whole page scrolls" footgun. `Clip` is **not** for text truncation (that's `TruncatingText`). `Sticky` uses `active={false}` to un-stick *without remounting children* (swapping `<Sticky>`↔`<div>` silently resets inner state). `Pin` is the sibling of `Overlay`, not an extension — `Overlay` = full-bleed `inset-0`; `Pin` = corner/edge/center anchors; neither does JS/pixel coords (those keep a per-site `eslint-disable`). `Overlay`'s `above` is *always* `pointer-events-none`; use `Overlay.Interactive` to re-enable a subtree. `ViewportOverlay` exists because `transform-gpu` ancestors bound a plain `fixed inset-0` to themselves; portaling to `<body>` escapes them — never hand-roll `fixed inset-0`.

### C. The truncation leaf — *the one box that owns `min-w-0`*

| Primitive | Plugin | Role | Key props (default) | Owns internally |
|---|---|---|---|---|
| **TruncatingText** | `truncating-text` | Single-line ellipsizing text leaf | `as`(`span`) · `side`(`end`) · `title`(auto) | `inline-block max-w-full min-w-0 truncate`; `side=start`→ RTL bidi flip |

`inline-block max-w-full` is load-bearing: it makes the box honor `overflow:hidden` in *any* parent (flex/grid/bare block) — a plain `inline` span silently no-ops `truncate` outside a flex/grid row. `min-w-0` is baked in; don't re-add it. Pairs with `region-line` (`items-center whitespace-nowrap`) on the **row** root — solve wrapping on the row, never per-leaf.

### D. Surface & chrome — *elevation, strips, interactive rows*

| Primitive | Plugin | Role | Key props (default) | Owns internally |
|---|---|---|---|---|
| **Surface** | `css/surface` | Semantic elevation (4 roles) | `level`(req: `sunken`/`base`/`raised`/`overlay`) | per-level bg/border/radius/shadow bundle + select-scope |
| **Card** | `css/card` | `raised` surface + padding + interactive/selected | `interactive` · `selected` · `as`(`div`) | `p-3` + hover/selected classes (over Surface raised) |
| **Bar** | `bar` | Single-line chrome strip (toolbar/header band) | `tier`(`chrome`) · `overflow`(`hidden`) · `endSafeArea` · `as` | `flex region-line gap-sm border-b` + tier height/padding |
| **Row** | `css/row` | Interactive list/menu/nav/tree row | `selected` · `size`(`md`) · `hover`(`accent`) · `bordered` · `indent` · `icon` · `actions` · `as`(`button`) | `flex region-line rounded-md p-row` + hover + hover-revealed actions |
| **SectionHeaderRow** | `css/row` | Collapsible section-header row | `open`(ctx) · `onClick`(ctx) · `variant`(`eyebrow`) · `actions` | `Row` + chevron + Collapsible-context wiring |
| **PaneToolbar** | `pane-toolbar` | Factory: reorderable pane `<header>` over Bar | `definePaneToolbar(id, {controlSize?})` → `.Start`/`.End`/`.Host` | `Host` renders both zones inside `<Bar tier=chrome>` |

`Surface` levels: `sunken`=`bg-muted`, `base`=`bg-background` (tone-only — add your own border/radius), `raised`=`rounded-md border bg-card shadow-sm`, `overlay`=`rounded-lg bg-popover shadow-md ring-1` (self-contained boxes). `Card` is a thin `Surface level=raised` wrapper; both bake Ctrl+A select-scope into the root. `Bar` owns *only* the strip — it slots nothing; consumers compose what they host. `Row` is single-line (`region-line` baked) — multi-line list items use a `Column`/`Card`. `PaneToolbar` must be called once at module scope so slots register at import; `Host` is the one sanctioned pane `<header>`.

### E. Identity & typographic leaves — *rigid chips, semantic text*

| Primitive | Plugin | Role | Key axes / props |
|---|---|---|---|
| **Text** | `css/text` | Semantic typography | `variant`(req: `title`/`heading`/`subheading`/`body`/`label`/`caption`/`eyebrow`) · `tone`(`default`/`muted`/`primary`/`destructive`) |
| **SectionLabel** | `css/text` | Eyebrow/section label (small-caps muted) | `<Text variant="eyebrow" tone="muted" as="div">` — folded into the `text` plugin 2026-06-20 (was a standalone `section-label` plugin) |
| **Badge** | `css/badge` | Canonical chip shell (LinkChip/ToggleChip compose it) | `variant`(`muted`/`primary`/`warning`/`destructive`/`success`/`info`) · `size`(`sm`/`md`) · `shape`(`rect`/`pill`) · `icon` · `mono` · `colorClass` |
| **LinkChip** | `css/link-chip` | Inline clickable nav chip | `onClick`(req) · `leading` · `mono` (always `<button>`, link coloring) |
| **ToggleChip** | `css/toggle-chip` | Stateful solid/ghost pill, height-matches buttons | `active`(req) · `variant`(`solid`/`ghost`) · `size`(ambient density) · `icon` |
| **SegmentedControl** | `css/toggle-chip` | Single-select group of ToggleChips | `options` · `value` · `onChange` (`role=radiogroup`) |

`Badge` chip shell = `inline-flex region-line max-w-full gap-xs p-chip align-baseline` with an inner `<span className="truncate">` (the label ellipsizes; don't nest a `TruncatingText`). `text-2xs`/`text-3xs` are a sanctioned sub-scale for chips, *not* routed through `Text`. `LinkChip` does **not** `stopPropagation` — callers own it when nested in clickable containers. `ToggleChip` inherits ambient `ControlSize` when `size` is omitted, so it height-matches the buttons beside it.

### F. Standard / token enforcement — *one scale per design dimension*

These own a closed scale + a lint rule; they aren't components you render (except where noted).

| Plugin | Scale it owns | Lint rule → bans |
|---|---|---|
| `spacing` | `SpaceStep` 8-step ramp (`none`…`2xl`) | `no-adhoc-spacing` → raw `gap-*`/`p-*`/`m-*`/`space-*` (numeric/arbitrary) |
| `css/radius` | `--radius`-derived `rounded-{sm…3xl}` (+ `none`/`full`/`checkbox`) | `no-adhoc-radius` → bare `rounded` + `rounded-[…]` |
| `css/z-layers` | 8 named layers `z-base`(0)…`z-max`(9999) | `no-adhoc-zindex` → `z-<n>` + `z-[…]` |
| `css/control-size` | `control-{xs,sm,md,lg}` density heights | `no-adhoc-control` → `buttonVariants` import + hand-rolled h+px+rounded button |
| `css/icon-auto` | `icon-auto` (1.15em) slot-icon sizing | `no-adhoc-slot-icon-size` → size class on a bare glyph in `icon=`/`leading=` of an auto-sizing primitive |
| `css/lint` (the umbrella) | — | `no-adhoc-layout` → raw flow/positioning utilities (see §7) |

**Shared scales** (defined in `spacing/web/internal/stack.tsx`): `SpaceStep = none|2xs|xs|sm|md|lg|xl|2xl` (0, .125, .25, .5, .75, 1, 1.5, 2 rem). `StackAlign = start|center|end|stretch|baseline`. `StackJustify = start|center|end|between|around|evenly`. Z-layer ladder: `base`(0) raised(10) nav(20) float(30) overlay(40) popover(50) draw(60) max(9999).

---

## 3. How to compose a clean layout (recipes)

The decision tree, then the canonical assemblies.

### Pick the container

```
Need to lay out children?
├─ A single horizontal chrome row with a clear leading/content/trailing structure
│     → Frame   (slots-as-props; shrink hierarchy is automatic)
├─ A vertical sticky-header / scroll-body / footer surface (pane, panel, dialog)
│     → Column  (header/body/footer; body scrolls by default)
├─ A wrapping row of rigid chips/tags
│     → Cluster
├─ A responsive grid of equal cards
│     → Grid    (minCellWidth + mode)
├─ Chips/icons that must sit *inside a sentence*
│     → Inline
├─ Just center something
│     → Center
└─ Anything else (a plain stack of blocks with rhythm)
      → Stack (+ Inset for padding)
```

### Recipe: a full pane (the single most common shape)

```tsx
<Column
  fill                                   // fill the surface
  header={<PaneTitleBar.Host />}         // rigid; a Bar/pane-toolbar
  body={<Inset pad="lg"><Stack gap="md"> // body scrolls automatically
    …content…
  </Stack></Inset>}
  footer={<Bar tier="pane">…</Bar>}      // rigid (optional)
/>
```

`Column` owns `min-h-0 flex-1 overflow-y-auto` once. You never write the scroll mechanics.

### Recipe: a chrome row that can't overlap

```tsx
<Frame
  leading={<Icon … />}                   // auto track, never crushed
  content="A long title that truncates"  // string → TruncatingText, truncates last
  meta={<RelativeTime … />}              // truncates first
  trailing={<RowActions … />}            // auto track, pinned right
/>
```

No `min-w-0`, no `shrink-0`, no `flex-1` — the grid tracks encode the shrink hierarchy.

### Recipe: card grid

```tsx
<Grid minCellWidth="14rem" gap="md">
  {items.map((it) => (
    <Card key={it.id} interactive as="button" onClick={…}>
      <Stack gap="sm">…</Stack>
    </Card>
  ))}
</Grid>
```

### Recipe: sticky header inside a scroll body

```tsx
<Scroll axis="y" fill>
  <Sticky edge="top" layer="raised" className="bg-background border-b">
    <Bar tier="pane">…</Bar>
  </Sticky>
  …rows…
</Scroll>
```

### Recipe: a scrim/overlay over content (in-flow)

```tsx
<Overlay behind={<Wallpaper />} clickThrough>
  <Stack gap="md">…interactive content…</Stack>
</Overlay>
// full-viewport modal instead? → ViewportOverlay layer="popover"
```

### The altitude rule of thumb

> **Structure (Frame/Column/Grid/Stack) on the outside → surface (Card/Surface/Bar) in the middle → leaves (Text/Badge/TruncatingText) on the inside.** A surface never owns layout sizing; a leaf never owns space-sharing; a container never owns elevation.

---

## 4. Quick "I want to… → use…" table

| Intent | Reach for | Never write |
|---|---|---|
| Gap between stacked blocks | `Stack gap` | `flex flex-col gap-2` / `space-y-2` |
| Padding | `Inset pad` | `p-3` / `px-4` |
| Header row with title + actions | `Frame` | `flex … min-w-0` + `absolute` trailing |
| Pane with scrolling body | `Column` (or `Scroll fill`) | `min-h-0 flex-1 overflow-y-auto` |
| Card collection | `Grid` | `grid grid-cols-…` |
| Wrapping tag row | `Cluster` | `flex flex-wrap gap-2` |
| Chip mid-sentence | `Inline` | `inline-flex items-center` |
| Center a thing | `Center` | `flex items-center justify-center` |
| Ellipsized label | `TruncatingText` | `truncate min-w-0` by hand |
| Clip overflow, no scroll | `Clip` | `overflow-hidden` |
| Sticky header | `Sticky` | `sticky top-0 z-10` |
| Corner badge / close button | `Pin` | `absolute top-1 right-1` |
| Full-bleed layer behind content | `Overlay behind` | `absolute inset-0` |
| Full-viewport modal/overlay | `ViewportOverlay` | `fixed inset-0` |
| Elevated box | `Surface` / `Card` | `rounded border bg-card shadow-sm` |
| Toolbar/header band | `Bar` / `PaneToolbar` | `flex border-b h-12` |
| Interactive list/nav row | `Row` | `flex rounded p-2 hover:bg-accent` |
| Text size/weight | `Text variant` | `text-sm font-medium` |
| Uppercase section label | `SectionLabel` | `text-xs uppercase tracking-wide` |
| Status/identity chip | `Badge` | `inline-flex rounded px-2 text-xs` |
| Toggle/segmented pill | `ToggleChip` / `SegmentedControl` | hand-rolled active-state button |

---

## 5. Default-value reference (where the primitives *disagree*)

A working developer trips on these because they aren't uniform. Memorize the exceptions.

| Primitive | `gap` default | `as` default | Notable |
|---|---|---|---|
| Stack | **required** | `div` | `direction` defaults to `col`, not `row` |
| Inline | **required** | **`span`** | only inline-default host |
| Frame | `sm` | `div` | `align` defaults `center` |
| Column | **`none`** (flush) | `div` | `fill` defaults `false` |
| Grid | `md` | `div` | loosest default |
| Cluster | `sm` | `div` | always row+wrap |
| Text | — | **`span`** | `tone` defaults `default` |
| Badge | — | **`span`** | shape `rect`, size `md` |
| Bar | (`gap-sm` fixed) | **`header`** (chrome) / `div` (pane) | |
| Row | (size-driven) | **`button`** | size `md` |

---

## 6. Layer / stacking vocabulary (two tiers from one shared source)

The z-layer ladder is one scale, exposed to primitives as two named tiers — both derived from a single shared source in `z-layers/web` (RESOLVED 2026-06-20, see §8.2):

- **`Overlay` / `Pin` / `Sticky`** take `InTreeLayer = base | raised | nav | float | overlay` (the in-tree z-layers, 0–40).
- **`ViewportOverlay`** takes `PortaledLayer = popover | draw | max` (the portaled top layers, 50–9999).
- Raw `z-<n>` / `z-[…]` is banned everywhere by `no-adhoc-zindex`; always pick a named layer.

The split is intentional (in-tree chrome can't out-stack a portaled modal). Both tiers and the name→class resolver (`zLayerClass()`) now live in the one `z-layers/web` barrel — a compile-time partition guard ties them to the full ladder, so the prop vocabularies are two slices of one source rather than disjoint copies.

---

## 7. Enforcement

**Principle: no raw layout utilities in feature code.** One escape valve, always with a named reason:
`// eslint-disable-next-line layout/no-adhoc-layout -- <reason>`.

`no-adhoc-layout` (`css/lint/`, registered repo-wide as `error`) bans:

- **Positioning:** `absolute`, `fixed`, `sticky`, `inset-*`
- **Flex:** `flex`, `inline-flex`, `flex-*`, `basis-*`
- **Grid:** `grid`, `inline-grid`, `grid-*`, `col-span-*`, `row-span-*`, `col/row-start/end/auto`
- **Flex-child sizing:** `shrink-*`, `grow-*`
- **Truncation footgun:** `min-w-0` (only that one — other `min-w-*` allowed)
- **Alignment:** `items-*`, `justify-*`, `self-*`, `place-{items,content,self}-*`
- **Overflow:** `overflow-*`

**Deliberately allowed:** positioning *context* (`relative`/`static`), sizing (`w-*`/`h-*`/`size-*`/`min-w-*` ≠ `min-w-0`), non-flow display (`block`/`hidden`/`inline`). Spacing and z-index live in their own rules.

**Allowlist state (audited 2026-06-20):** *fully drained.* `no-adhoc-layout` went 471 → 0; `no-adhoc-spacing` went 389 → 0. The only permanent exemptions are the layout primitives themselves (they own the mechanics) plus `floating-action.tsx`. `radius`/`z-layers`/`control-size`/`icon-auto` rules launched with zero exemptions. New code is gated immediately.

Sibling standard rules (own their dimensions): `no-adhoc-typography` (Text), `no-adhoc-radius`, `no-adhoc-zindex`, `no-adhoc-control`, `no-adhoc-surface` (Surface/Card), `no-adhoc-slot-icon-size` (icon-auto), `no-adhoc-bar` (Bar), `no-adhoc-pane-toolbar`, `no-adhoc-row` (Row), `no-badge-text-transform` (Badge), `no-clip-without-nowrap` (Clip/TruncatingText), `no-adhoc-viewport-overlay`.

---

## 8. Audit findings — rough edges worth a structural fix

The system is in excellent shape (both burndowns at 0, near-total coverage of the layout-utility surface). These are the seams the audit surfaced — each is a small inconsistency that costs a developer a lookup or risks a subtle bug. Listed roughly by impact; none is urgent.

1. ~~**`Clip`'s `fill` ignores `axis`.**~~ **RESOLVED (2026-06-20).** `clipClasses` now mirrors `Scroll`'s axis-aware fill: `fill` emits `min-w-0 flex-1` for `axis="x"` and `min-h-0 flex-1` otherwise, so a horizontal `<Clip axis="x" fill>` gets the correct flex-fill mechanic. No existing call site combined `axis="x"` + `fill`, so the fix changed zero current renders — it was purely corrective. Pure test extended to cover the `x`-axis pair.

2. ~~**Layer-vocabulary split has no shared source.**~~ **RESOLVED (2026-06-20).** `z-layers` now ships a `web/` barrel that is the single source of the name→class map, exposing `zLayerClass()` plus the `InTreeLayer`/`PortaledLayer` tiers (which a compile-time partition guard ties to the full ladder). `Overlay`/`Pin`/`Sticky`/`ViewportOverlay` import the resolver and deleted their local `LAYER_CLASS` copies; the disjoint unions are now two named tiers derived from one ladder. See [css-z-layers-web-barrel](./2026-06-20-css-z-layers-web-barrel.md).

3. **`Card` padding is off-ramp.** `Card` hardcodes `p-3` (a `PAD` const predating the density ramp) instead of an `Inset`/`SpaceStep` value, so it does *not* scale with the Density preset like everything else. → Move card padding onto the ramp (`md` ≈ current 0.75rem) so a Compact/Cozy density actually tightens cards.

4. ~~**`Grid` requires `minCellWidth` even when `cols` is set.**~~ **RESOLVED (2026-06-20).** `GridProps` is now a `{cols}` xor `{minCellWidth, mode?}` discriminated union — a fixed-column grid takes no `minCellWidth`, a responsive grid takes no `cols`; passing both is a type error, so the contradictory call is unrepresentable. All former fixed-`cols` callers dropped their dead `minCellWidth="0"`/`"20rem"`. See [css-grid-discriminated-union](./2026-06-20-css-grid-discriminated-union.md).

5. **"Exactly one primitive owns `min-w-0`" is aspirational, not literal.** Besides `TruncatingText`, `min-w-0` is also legitimately emitted by `Scroll`/`Clip` (`fill` on x), `Bar` (pane tier), `Frame`'s inert spacer, and `ResponsiveOverflow`. These are all *container-fill* uses, not *leaf-truncation* uses — a different role that happens to share the class. → The principle is sound; the wording in the skill/docs should distinguish "the truncation leaf owns `min-w-0`-for-ellipsis" from "fill containers may use `min-w-0`-for-flex-basis." (Documented here; no code change.)

6. **`gap` default divergence is unmemorable.** `Stack`/`Inline` require it; `Column` defaults `none`; `Frame`/`Cluster` default `sm`; `Grid` defaults `md`. The §5 table is the mitigation, but the spread invites mistakes. → Consider documenting the rationale (flush columns, comfortable grids) inline in each barrel's JSDoc so it surfaces on hover.

7. **`ResponsiveOverflow` carries a permanent `eslint-disable` for its own mechanics.** Its `inline-flex min-w-0 overflow-hidden whitespace-nowrap` is measurement-fundamental and has no primitive equivalent, so it disables `no-adhoc-layout` inline (and is in the permanent allowlist). This is correct but means it's a second primitive (besides `floating-action`) living *outside* the `css/*` tree yet exempt. → Fine as-is; noted for completeness so a future audit doesn't flag it as drift.

**Per project convention, these are surfaced here (and to the user) rather than memorized — the fix is structural (a union type, a shared barrel, a ramp value), not a workaround each developer carries.**

---

## 9. One-line summary

> Containers share space and declare the shrink hierarchy once (`Frame`/`Column`/`Grid`/`Stack`); overflow and positioning are their own roles (`Scroll`/`Clip`/`Sticky`/`Pin`/`Overlay`); exactly one leaf truncates (`TruncatingText`); surfaces and chrome (`Surface`/`Card`/`Bar`/`Row`) sit between structure and leaves; every design dimension (space, radius, z, control height, icon size, typography) has a closed scale and a lint rule. Write the role; the primitive owns the mechanics and fixes them globally.

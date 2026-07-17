---
name: css
description: >
  Map of the CSS/layout mental model and composable layout primitives —
  containers share space, leaves truncate, write the role not the mechanics.
  Read BEFORE any layout, structure, or CSS-composition work.
---

# CSS & Layout

How to compose boxes. For tokens / color / preset and the typography·radius·surface·z-index·control·icon standards, see the [`theme` skill](../theme/SKILL.md). Split: **`css` owns *how to compose boxes*; `theme` owns *tokens & color*.**

## Mental model

> **The spine: every box is exactly one of two things.** A **container** *arranges children* — it declares direction and how slack is shared. A **content leaf** *sizes to itself* — rigid, flexible, or truncating. **Every rule below follows from that split.** Fusing both jobs onto one `<div className="flex … min-w-0 truncate">` (container *and* leaf) is the root of the entire layout-bug class.

Write the role, not the mechanics; let the container own the policy.

- **Space-sharing is a container property, declared once** — never negotiated per child by sprinkling `min-w-0`/`shrink-0`/`flex-1` and hoping it converges.
- **The shrink hierarchy is explicit and total.** For any row that can overflow, "what gives first?" has one answer in one place: rigid identity (chips/icons) never shrinks → secondary metadata truncates first → primary content truncates last.
- **Prefer the layout mode where the bug is unrepresentable.** `rigid | flexible | rigid` is canonical Grid (`auto minmax(0,1fr) auto`); an `auto` track can't collapse under its own rigid content, so "container crushed by its own chip" *cannot* happen. Choose the mode that forbids the bug over the one that merely lets you avoid it.
- **`min-width: 0` is a deliberate leaf decision, never a container reflex.** Exactly one primitive — the truncation leaf (`Text`) — owns it. (Fill containers like `Scroll`/`Clip` use `min-w-0`/`min-h-0` as a *flex-basis* mechanic — a different role that happens to share the class.)
- **Single-line is a property of the CONTAINER, not the text.** The same `<Text>` is correct wrapping in a paragraph and broken wrapping in a row — so whether it truncates is owned by where it lives. **Line containers** (`Row`, `Bar`, collapsible headers, the app tab chip) are single-line by contract: they provide an ambient `SingleLine` context (so every `<Text>` inside ellipsizes on one line) *and* `whitespace-nowrap` (so raw strings/chips don't wrap). That two-layer contract is packaged as the bare **`Line`** primitive (`css/line`) — `Row`/`Bar` compose it, and you reach for it directly for any bespoke single-line strip. **Flow containers** (`Stack` col / `Stack wrap` / `Column` / `Cluster`) RESET both, so text wraps again. There is **no truncation prop on `Text`** — you pick the container, and "non-truncating text in a line row" is unrepresentable. (A plain horizontal `Stack`/`Inline` — row, no `wrap` — is line-ish: it *inherits* the surrounding contract rather than resetting.) The rare forced-single-line case is exactly what `<Line>` is for (or, for just the ambient half without a flex row, `<SingleLineProvider value={true}>` from `…/ui-kit/web`).
- **Group-wrap is a SEPARATE axis from text-wrap.** `whitespace-nowrap` stops *text* wrapping but never `flex-wrap`, so a *group of chips* (a render slot's contributions, a badge cluster) wrapping is owned by container choice: `Cluster` wraps, `Inline`/`Row` stay one line. A multi-contribution chip slot must be wrapped in `Inline`/`Cluster` — a bare `.Render` adds no container, so the chips wrap by default.
- **Semantic intent over mechanics.** Write `content` / `meta` / `stack with sm rhythm`; the primitive owns `flex items-center gap-2 min-w-0 …` and can fix it once, globally. Same "CSS-in-semantics" philosophy as `spacing`/`text`/`surface`.
- **Size is a region property, not a per-element prop.** Same "container owns the policy" rule applied to control density: a control's size (height·text·padding·icon) is inherited from the ambient `ControlSize` a container declares **once** (`ControlSizeProvider`, or a slot's `controlSize`) — never set per instance. `Badge` / `ToggleChip` / `SegmentedControl`, the icon buttons, and **`Button`** all derive density *solely* from context (no `size` prop anywhere; passing one is a compile error). `Button` is the last control that used to hold out — that escape hatch is gone. `Button`'s **shape** (text / icon / inline) is a separate `aspect` prop and carries no density. Full model in the [`theme` skill](../theme/SKILL.md).

### Worked example — a header row that won't overlap

```tsx
// WRONG — container + leaf fused onto every div; the bug cascades forever
<div className="flex items-center gap-2 min-w-0">
  <Icon />
  <span className="flex-1 truncate">{title}</span>   {/* no min-w-0 → truncate is dead */}
  <RelativeTime date={t} />
  <div className="absolute right-2"><Actions /></div> {/* pr-hint only → floats over title */}
</div>

// RIGHT — Frame owns the grid tracks; each box has one job; the overlap is unrepresentable
<Frame
  leading={<Icon />}                  // rigid `auto` track, never crushed
  content={title}                     // string → single-lining Text leaf, truncates last
  meta={<RelativeTime date={t} />}    // truncates first
  trailing={<Actions />}              // rigid `auto` track, pinned right
/>
```

## The overlap bug class (read before hand-rolling any row)

Two boxes overlap when one lands in a region the layout engine never reserved
*for it* — because the boundary was a **hint the content can ignore**, not a real
track. Two recurring shapes, both fixed by a grid track / clip:

- **Absolute trailing indicator + reservation padding.** `relative flex … pr-2xl`
  with a trailing checkmark/badge `absolute right-2`. The `pr-2xl` is only a hint;
  a `flex-1`/`shrink-0` label grows under the floating indicator. → Use a real
  rigid track (`Frame` `trailing`, or inline `grid-cols-[minmax(0,1fr)_auto]` at
  the layers below `Frame`). Never `absolute` + padding-reservation for a
  trailing affordance.
- **Rigid leaf in an unclipped flexible cell.** A `flex-1 min-w-0` cell with **no
  overflow clip** holding a `shrink-0` child (a `SegmentedControl`, a fixed
  control): when narrow the child overflows onto the next sibling. → The cell must
  own its overflow (`Clip`) or the child must be allowed to yield. Also: `flex-1
  truncate` **without** `min-w-0` never shrinks (implicit `min-width:auto`) — the
  `truncate` is dead; always `min-w-0 flex-1 truncate`.

**Layer rule — no primitive re-derives flex+absolute row layout by hand.** Above
`Frame` in the DAG, compose `Frame`. At/below `Frame` (the few primitives `Frame`
itself is built on, e.g. `ui-kit`'s shadcn menu items — importing `Frame` there
would cycle), write the grid tracks directly. Either way the indicator/affordance
lives in a track, never floats over the label.

## Layout primitives

Reach for these instead of raw flex/grid. Import from `@plugins/primitives/plugins/<name>/web` (the `css/*` layout primitives live under `@plugins/primitives/plugins/css/plugins/<name>/web`). Shared conventions mirror `Stack`: `gap: SpaceStep`, reused `StackAlign`/`StackJustify`, `as?`, `className` last. **All accept `ref?: React.Ref<HTMLElement>`** (React-19 ref-as-prop) — pass `<Scroll ref={sticky.scrollRef}>` for auto-scroll / sticky-scroll / ResizeObserver / scroll-into-view; never fall back to a raw `<div ref=…>` + eslint-disable just to attach a ref.

**Pick a container:** structured chrome row → `Frame` · sticky-header / scroll-body / footer surface → `Column` · card grid → `Grid` · wrapping chips/tags → `Cluster` · chips mid-sentence → `Inline` · just center something → `Center` · plain stack of blocks with rhythm → `Stack` (+ `Inset` for padding). Then surfaces (`Card`/`Surface`/`Bar`) sit *inside* structure, leaves (`Text`/`Badge`) *inside* those: structure → surface → leaf, outside-in. **A list of domain records is not a container choice at all** — it's a [`DataView`](../../../plugins/primitives/plugins/data-view/CLAUDE.md) (`data-view/no-adhoc-row-list` bans `.map()`→`<Row>`); `Row`+map is only for transient chrome (menus, pickers, tab strips) with a named disable.

**Defaults differ — check, don't assume:** `gap` is *required* on `Stack`/`Inline`, but `none` on `Column`, `sm` on `Frame`/`Cluster`, `md` on `Grid`. `as` defaults to `div` everywhere *except* `Inline`/`Text` (`span`) and `Bar` (`header`).

- **`Stack` / `Inset`** (`spacing`) — 1-D flow container (dir·gap·align·justify·wrap) · padding container. The home for layout rhythm. → [CLAUDE.md](../../../plugins/primitives/plugins/spacing/CLAUDE.md)
- **`Frame`** (`css/frame`) — named-slot row, **slots-as-props** (no children): `leading` (rigid) · `content` (truncates last) · `meta` (truncates first) · `trailing` (rigid-right). CSS Grid owns the shrink hierarchy in one place — the structural fix for overlapping/overflowing header rows. String `content`/`meta` auto-wrap in the truncation leaf.
- **`Column`** (`css/column`) — named-slot **column** (the vertical twin of `Frame`), **slots-as-props** (no children): `header` (rigid) · `body` (flexible, scrolls by default) · `footer` (rigid). Bakes the `rigid | flexible | rigid` fill policy — `shrink-0` header/footer, body delegated to `<Scroll fill>` — so sticky-header / scroll-body / footer surfaces (panels, panes, dialogs) never re-derive `min-h-0 flex-1 overflow-y-auto` by hand. `scrollBody={false}` for a plain flexible body; `fill` to fill a flex-col parent (e.g. inside a `FloatingAction` morph panel).
- **`Grid`** (`css/grid`) — responsive/uniform card grid via closed `minCellWidth` + `mode: fill|fit` (or fixed `cols`). **Not** a raw `grid-template` passthrough; the rigid|flex|rigid structural case is `Frame`'s job.
- **`Cluster`** (`css/cluster`) — wrap-friendly group of rigid chips/tags. Thin `Stack` row+wrap specialization (chips wrap, never crush).
- **`Center`** (`css/center`) — centering box (`grid place-items`), `axis: both|horizontal|vertical`.
- **`Overlay`** (`css/overlay`) — in-flow positioning: `behind`/`above` full-bleed layers (z-layer-aware) + `clickThrough` with `Overlay.Interactive` opt-in (the sanctioned home for the click-through-toggle idiom). Pairs with `ViewportOverlay` (which portals to body for true `fixed inset-0`).
- **`Scroll`** (`css/scroll`) — scroll-container box: owns overflow + the flex-child fill policy as one role. `axis: y|x|both`, `fill` (`min-h-0 flex-1`), `hideScrollbar`, `isolate`. Sizing (`h-*`/`max-h-*`) stays in `className`. The home for `min-h-0 flex-1 overflow-y-auto`.
- **`Clip`** (`css/clip`) — clipped, non-scrolling overflow (`overflow-hidden`); sibling of Scroll. `axis: both|x|y`, `fill`. **Not** for text truncation (that's `Text` inside a line container); `rounded-*`/`border` stay in `className`.
- **`Sticky`** (`css/sticky`) — sticky header/footer: `edge: top|bottom|left|right`, `offset: SpaceStep`, z-layer-aware `layer`. The home for `sticky top-0 z-raised`; `bg-*`/`border-*` stay in `className`.
- **`Pin`** (`css/pin`) — point-anchored absolute child of a `relative` parent (sibling of Overlay, not full-bleed): `to` (9 anchors: corners·edge-centers·center), `offset`/`outset`, `layer`, `decorative`, `stretch`. The home for `absolute top-1 right-1`. JS/pixel coords stay an `eslint-disable`.
- **`Text`** (`css/text`) — **the** truncation leaf (and the typography primitive). Inside a **line container** it single-lines + ellipsizes automatically via the ambient `SingleLine` context (it owns the `min-w-0 + truncate` recipe); inside a **flow container** it wraps. `side="start"` ellipsizes the lead (file paths); no truncation on/off prop — pick the container. → [CLAUDE.md](../../../plugins/primitives/plugins/css/plugins/text/CLAUDE.md)
- **`Line`** (`css/line`) — the bare **line-container** primitive: `flex region-line` + the ambient `SingleLine` context, no chrome. The sanctioned home for a single-line row where raw strings/chips don't wrap and `<Text>` leaves ellipsize. `Row`/`Bar` compose it; reach for it directly for a bespoke single-line strip (a tab chip, a card header) that isn't a full `Row`/`Bar`. `Badge` stays `inline-flex` (the inline case) and doesn't compose it. → [CLAUDE.md](../../../plugins/primitives/plugins/css/plugins/line/CLAUDE.md)
- **`Row` / `SectionHeaderRow`** (`row`) — interactive row (list·menu·nav·tree·section-header). A `.map()` of domain records into `Row` is banned (`data-view/no-adhoc-row-list`) — that's a `DataView`. → [CLAUDE.md](../../../plugins/primitives/plugins/row/CLAUDE.md)
- **`Surface`** (`surface`) — elevation roles (sunken·base·raised·overlay). → [CLAUDE.md](../../../plugins/primitives/plugins/surface/CLAUDE.md)
- **`Card`** (`card`) — raised + padded chrome. → [CLAUDE.md](../../../plugins/primitives/plugins/card/CLAUDE.md)
- **`ViewportOverlay`** (`viewport-overlay`) — portals to body for true `fixed inset-0` + z-layer + theme-scope. → [CLAUDE.md](../../../plugins/primitives/plugins/viewport-overlay/CLAUDE.md)
- **`ResponsiveOverflow`** (`responsive-overflow`) — progressively hides children that don't fit the width. → [CLAUDE.md](../../../plugins/primitives/plugins/responsive-overflow/CLAUDE.md)

The full audit — every primitive's exact API, composition recipes, the defaults table, and known rough edges — is the [CSS primitives audit](../../../research/2026-06-20-css-primitives-audit.md). Design rationale + track mechanics for the original `css/*` primitives are frozen in [the API spec](../../../research/2026-06-15-global-css-layout-primitive-apis.md); the roadmap is in [the vision doc](../../../research/2026-06-15-global-css-layout-primitives-vision.md). The Scroll/Clip/Sticky/Pin set (closing the scroll/clip/sticky/positioning gaps) is specified in the [allowlist-drain plan](../../../research/2026-06-17-global-drain-no-adhoc-layout-allowlist.md).

## Enforcement

Principle: **no raw layout utilities in feature code** — one escape valve, always with a named reason: `// eslint-disable-next-line layout/no-adhoc-layout -- <reason>`.

The `no-adhoc-layout` rule (`plugins/primitives/plugins/css/lint/`, registered repo-wide as `error`) bans raw flow/display (`flex*`, `grid*`, `basis-*`, `col-span-*`, `row-span-*`), space-sharing (`shrink-*`, `grow-*`, `min-w-0`), alignment (`items-*`, `justify-*`, `place-*`, `self-*`), positioning (`absolute`, `fixed`, `sticky`, `inset-*`), and clipping (`overflow-*`). Deliberately **not** banned: positioning *context* (`relative`/`static`), sizing (`w-*`/`h-*`/`size-*`/`min-w-*` other than `min-w-0`), and non-flow display (`block`/`hidden`/`inline`). Spacing (`gap-*`/`p-*`/`m-*`) and `z-*` are owned by their own rules, so this one stays out of their lane.

The layout primitives themselves are **permanently** exempt (they own the raw mechanics). The pre-rule burndown allowlist in `css/lint/index.ts` is **fully drained** (471 → 0, mirroring `no-adhoc-spacing`'s 389 → 0) — the rule now enforces repo-wide with only the permanent primitive exemption; don't add entries back. New code is gated immediately. The other token/standard rules (typography, radius, surface, z-index, control, icon) are listed in the [`theme` skill](../theme/SKILL.md).

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.

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

Write the role, not the mechanics; let the container own the policy.

- **One job per box.** A box is either a **container** (arranges children: declares direction + how slack is shared) or a **content leaf** (sizes to itself: rigid, flexible, or truncating). Fusing both onto one `<div className="flex … min-w-0 truncate">` is the root of the layout bug class.
- **Space-sharing is a container property, declared once** — never negotiated per child by sprinkling `min-w-0`/`shrink-0`/`flex-1` and hoping it converges.
- **The shrink hierarchy is explicit and total.** For any row that can overflow, "what gives first?" has one answer in one place: rigid identity (chips/icons) never shrinks → secondary metadata truncates first → primary content truncates last.
- **Prefer the layout mode where the bug is unrepresentable.** `rigid | flexible | rigid` is canonical Grid (`auto minmax(0,1fr) auto`); an `auto` track can't collapse under its own rigid content, so "container crushed by its own chip" *cannot* happen. Choose the mode that forbids the bug over the one that merely lets you avoid it.
- **`min-width: 0` is a deliberate leaf decision, never a container reflex.** Exactly one primitive — the truncation leaf — owns it.
- **Semantic intent over mechanics.** Write `content` / `meta` / `stack with sm rhythm`; the primitive owns `flex items-center gap-2 min-w-0 …` and can fix it once, globally. Same "CSS-in-semantics" philosophy as `spacing`/`text`/`surface`.

## Layout primitives

Reach for these instead of raw flex/grid. Import from `@plugins/primitives/plugins/<name>/web` (the `css/*` layout primitives live under `@plugins/primitives/plugins/css/plugins/<name>/web`). Shared conventions mirror `Stack`: `gap: SpaceStep`, reused `StackAlign`/`StackJustify`, `as?`, `className` last. **All accept `ref?: React.Ref<HTMLElement>`** (React-19 ref-as-prop) — pass `<Scroll ref={sticky.scrollRef}>` for auto-scroll / sticky-scroll / ResizeObserver / scroll-into-view; never fall back to a raw `<div ref=…>` + eslint-disable just to attach a ref.

- **`Stack` / `Inset`** (`spacing`) — 1-D flow container (dir·gap·align·justify·wrap) · padding container. The home for layout rhythm. → [CLAUDE.md](../../../plugins/primitives/plugins/spacing/CLAUDE.md)
- **`Frame`** (`css/frame`) — named-slot row, **slots-as-props** (no children): `leading` (rigid) · `content` (truncates last) · `meta` (truncates first) · `trailing` (rigid-right). CSS Grid owns the shrink hierarchy in one place — the structural fix for overlapping/overflowing header rows. String `content`/`meta` auto-wrap in the truncation leaf.
- **`Grid`** (`css/grid`) — responsive/uniform card grid via closed `minCellWidth` + `mode: fill|fit` (or fixed `cols`). **Not** a raw `grid-template` passthrough; the rigid|flex|rigid structural case is `Frame`'s job.
- **`Cluster`** (`css/cluster`) — wrap-friendly group of rigid chips/tags. Thin `Stack` row+wrap specialization (chips wrap, never crush).
- **`Center`** (`css/center`) — centering box (`grid place-items`), `axis: both|horizontal|vertical`.
- **`Overlay`** (`css/overlay`) — in-flow positioning: `behind`/`above` full-bleed layers (z-layer-aware) + `clickThrough` with `Overlay.Interactive` opt-in (the sanctioned home for the click-through-toggle idiom). Pairs with `ViewportOverlay` (which portals to body for true `fixed inset-0`).
- **`Scroll`** (`css/scroll`) — scroll-container box: owns overflow + the flex-child fill policy as one role. `axis: y|x|both`, `fill` (`min-h-0 flex-1`), `hideScrollbar`, `isolate`. Sizing (`h-*`/`max-h-*`) stays in `className`. The home for `min-h-0 flex-1 overflow-y-auto`.
- **`Clip`** (`css/clip`) — clipped, non-scrolling overflow (`overflow-hidden`); sibling of Scroll. `axis: both|x|y`, `fill`. **Not** for text truncation (that's `TruncatingText`); `rounded-*`/`border` stay in `className`.
- **`Sticky`** (`css/sticky`) — sticky header/footer: `edge: top|bottom|left|right`, `offset: SpaceStep`, z-layer-aware `layer`. The home for `sticky top-0 z-raised`; `bg-*`/`border-*` stay in `className`.
- **`Pin`** (`css/pin`) — point-anchored absolute child of a `relative` parent (sibling of Overlay, not full-bleed): `to` (9 anchors: corners·edge-centers·center), `offset`/`outset`, `layer`, `decorative`, `stretch`. The home for `absolute top-1 right-1`. JS/pixel coords stay an `eslint-disable`.
- **`TruncatingText`** (`truncating-text`) — **the** truncation leaf; bakes in the `min-w-0 + truncate` pair a flexible label needs in a flex row. → [CLAUDE.md](../../../plugins/primitives/plugins/truncating-text/CLAUDE.md)
- **`Row` / `SectionHeaderRow`** (`row`) — interactive row (list·menu·nav·tree·section-header). → [CLAUDE.md](../../../plugins/primitives/plugins/row/CLAUDE.md)
- **`Surface`** (`surface`) — elevation roles (sunken·base·raised·overlay). → [CLAUDE.md](../../../plugins/primitives/plugins/surface/CLAUDE.md)
- **`Card`** (`card`) — raised + padded chrome. → [CLAUDE.md](../../../plugins/primitives/plugins/card/CLAUDE.md)
- **`ViewportOverlay`** (`viewport-overlay`) — portals to body for true `fixed inset-0` + z-layer + theme-scope. → [CLAUDE.md](../../../plugins/primitives/plugins/viewport-overlay/CLAUDE.md)
- **`ResponsiveOverflow`** (`responsive-overflow`) — progressively hides children that don't fit the width. → [CLAUDE.md](../../../plugins/primitives/plugins/responsive-overflow/CLAUDE.md)

Design rationale + track mechanics for the original `css/*` primitives are frozen in [the API spec](../../../research/2026-06-15-global-css-layout-primitive-apis.md); the roadmap is in [the vision doc](../../../research/2026-06-15-global-css-layout-primitives-vision.md). The Scroll/Clip/Sticky/Pin set (closing the scroll/clip/sticky/positioning gaps) is specified in the [allowlist-drain plan](../../../research/2026-06-17-global-drain-no-adhoc-layout-allowlist.md).

## Enforcement

Principle: **no raw layout utilities in feature code** — one escape valve, always with a named reason: `// eslint-disable-next-line layout/no-adhoc-layout -- <reason>`.

The `no-adhoc-layout` rule (`plugins/primitives/plugins/css/lint/`, registered repo-wide as `error`) bans raw flow/display (`flex*`, `grid*`, `basis-*`, `col-span-*`, `row-span-*`), space-sharing (`shrink-*`, `grow-*`, `min-w-0`), alignment (`items-*`, `justify-*`, `place-*`, `self-*`), positioning (`absolute`, `fixed`, `sticky`, `inset-*`), and clipping (`overflow-*`). Deliberately **not** banned: positioning *context* (`relative`/`static`), sizing (`w-*`/`h-*`/`size-*`/`min-w-*` other than `min-w-0`), and non-flow display (`block`/`hidden`/`inline`). Spacing (`gap-*`/`p-*`/`m-*`) and `z-*` are owned by their own rules, so this one stays out of their lane.

The layout primitives themselves are **permanently** exempt (they own the raw mechanics); every pre-rule offender is **grandfathered** in a burndown allowlist in `css/lint/index.ts` that drains to 0 over time (the `no-adhoc-spacing` playbook: 389 → 0). New code is gated immediately. The other token/standard rules (typography, radius, surface, z-index, control, icon) are listed in the [`theme` skill](../theme/SKILL.md).

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.

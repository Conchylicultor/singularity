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

Reach for these instead of raw flex/grid. Import from `@plugins/primitives/plugins/<name>/web`.

- **`Stack` / `Inset`** (`spacing`) — 1-D flow container (dir·gap·align·justify·wrap) · padding container. The home for layout rhythm. → [CLAUDE.md](../../../plugins/primitives/plugins/spacing/CLAUDE.md)
- **`TruncatingText`** (`truncating-text`) — **the** truncation leaf; bakes in the `min-w-0 + truncate` pair a flexible label needs in a flex row. → [CLAUDE.md](../../../plugins/primitives/plugins/truncating-text/CLAUDE.md)
- **`Row` / `SectionHeaderRow`** (`row`) — interactive row (list·menu·nav·tree·section-header). → [CLAUDE.md](../../../plugins/primitives/plugins/row/CLAUDE.md)
- **`Surface`** (`surface`) — elevation roles (sunken·base·raised·overlay). → [CLAUDE.md](../../../plugins/primitives/plugins/surface/CLAUDE.md)
- **`Card`** (`card`) — raised + padded chrome. → [CLAUDE.md](../../../plugins/primitives/plugins/card/CLAUDE.md)
- **`ViewportOverlay`** (`viewport-overlay`) — portals to body for true `fixed inset-0` + z-layer + theme-scope. → [CLAUDE.md](../../../plugins/primitives/plugins/viewport-overlay/CLAUDE.md)
- **`ResponsiveOverflow`** (`responsive-overflow`) — progressively hides children that don't fit the width. → [CLAUDE.md](../../../plugins/primitives/plugins/responsive-overflow/CLAUDE.md)

## Planned primitives

Not built yet — see [the vision doc](../../../research/2026-06-15-global-css-layout-primitives-vision.md). Until they land, the cases below need raw layout CSS.

- **`Frame`** — named-slot row (`leading` · `content` · `meta` · `trailing`) that owns the shrink hierarchy in one place. The structural fix for overlapping/overflowing header rows.
- **`Grid`** — explicit tracks (`auto minmax(0,1fr) auto`, responsive card grids).
- **`Cluster`** — wrap-friendly group of chips/tags.
- **`Center`** — centering.
- **`Overlay`** — sanctioned in-flow positioning (`absolute inset-0`, z-layer-aware).

## Enforcement

Principle: **no raw layout utilities in feature code** (`flex*`, `grid*`, `min-w-0`, `shrink-*`, `items-*`, `justify-*`, `absolute`, `inset-*`, `overflow-*`, …) — one escape valve, always with a named reason: `// eslint-disable-next-line layout/no-adhoc-layout -- <reason>`. The `no-adhoc-layout` rule is **planned** (see the vision doc); the existing token/standard rules (typography, radius, surface, z-index, control, icon) are listed in the [`theme` skill](../theme/SKILL.md).

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.

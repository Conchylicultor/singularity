# control-panel

The vocabulary for a **data-control panel** — the body of a Filter popover, a
Sort popover, a view-settings menu, a per-field editor. One compound namespace
(`ControlPanel` plus `.Section` / `.Row` / `.RuleList` / `.RuleRow` / `.Field` /
`.Footer` / `.Empty` / `.Stack`) and one surface (`ControlPanelPopover`).

## The five invariants

1. **One rail.** Every label in every panel starts at the same x.
2. **One row height**, in every panel, always.
3. **One selection language per meaning** — check, radio, switch. There is no
   fourth, and the three cannot be mixed on one row.
4. **Footers are rows**, never ghost buttons pinned to opposite corners — and
   **a footer action takes a leading `icon`, on every panel.** Uniformly: the
   alternative produced three treatments of one thing (a trailing upload glyph
   on one picker, no glyph at all on two others), and the approved prototype
   showed a leading one. A footer row is still a row, so the glyph does open the
   panel's icon column — but on the icon rail that costs only the ROW LABELS
   26px, not every block in the panel, and in a picker whose only row IS the
   footer it costs nothing at all. The one real price: in a panel that also has
   ordinary rows (quick-theme's six variant rows) a leading footer glyph still
   indents their labels by 26px. Exempting footers from the track scan would be
   a lie about the markup (this invariant says they ARE rows), so the uniformity
   is a convention — the only one in the vocabulary not held by construction.
5. **Width is a role, not a measurement.** A panel never resizes as its content
   changes.

They hold by construction, not by discipline: the row is a grid so #1 survives a
row with no icon, `RowProps` is a discriminated union so #3 is a type error, and
`ControlPanelPopover` has no width prop so #5 has nothing to override. The one
exception is the sentence added to #4, and it is marked as such.

## The panel paints no surface

`ControlPanel` draws no background, border, shadow, radius, scroll, height clamp
or **width**. The surface is always an `OverlayPanel` contributed by whatever
contains the body (a `ControlPanelPopover`, a `DialogContent`, a pushed
panel-stack entry). Three things follow, and together they are the reason:

- No double elevation — so the primitive needs no `no-adhoc-surface` exemption.
- A panel inside a panel is a popover opened from inside a popover, each with its
  own correctly-clamped surface, rather than an inner box re-deriving the outer
  one's chrome.
- Width can be a role: there is no width prop here to default, so the widest row
  cannot decide how wide the panel is.

What the body **does** own is geometry: the content inset, the rails, and
**the hairline between its bands**. That inversion is load-bearing — the
container separates, so an author never places a divider. A conditionally null
section leaves no orphan rule, a footer is separated because it is a band rather
than because it opted in, and the rhythm cannot go ragged one panel at a time.

## The separator is a band's rule, cancelled by the panel — NEVER a sibling rule

`display: contents` is transparent to **layout** and opaque to **selectors**, and
`renderIsolated` wraps every contributed panel in exactly such a lineage span (one
per contribution, nested). So a rule keyed on child adjacency — `> * + *`,
`:first-child`, `~` — sees one span and matches nothing. Do not reach for one
here; a `cp-body > * + * { border-top }` is where this vocabulary started and it
meant no panel in the app drew a single hairline. Key on layout participation
instead: a flex container lays the bands out as its own real items at any wrapper
depth.

- **`cp-body`** — flex column + `gap`. `gap` is the only spacing that exists
  strictly *between* items, so the first band is never handed a leading gap to
  take away again.
- **`cp-band`** (`Section` + `Footer` only) — draws the rule as a `::before` hung
  `--cp-panel-pad` **above** the band, so the band's box does not grow by it.
- **`cp-body::after`** — cancels the *first* band's rule (nothing above it to
  separate from). No selector can name that band, so the panel paints
  `--chrome-mask` over the one rule landing on its padding-box top edge.

Four things there are one edit from being wrong:

- **The rule may not be a `border-top`.** A first band carrying 1px + top padding
  as real height cannot be cancelled by ink, and the compensating panel padding
  works out to −1px.
- **`cp-panel` and `cp-body` stay on ONE element** — the mask's `top: 0` is right
  only because the same box insets by the same `--cp-panel-pad` the band hangs by.
  Asserted in the unit test.
- **`::after`, not `::before`** — rule and mask are both positioned at `z-index:
  auto`, so they paint in tree order; only `::after` follows the bands.
- **`ControlPanel.Stack` is `display: contents`** (and so has no `className`), so
  there is exactly one band container and one mask.

`RuleList` and `Empty` are deliberately **not** bands: both are used *inside* a
section, so marking either draws a rule through the middle of one.

**`--border` is the right colour — do not add a surface-relative separator var.**
Measured on `--popover`: distance 46 in dark, ≈39 in light. `--popover` and
`--card` are the same value in both modes and `--border` is the token calibrated
against `--card`, so an invisible panel separator would mean invisible card
borders. `--hover-fill` exists because `--muted` genuinely collided with
`--sidebar`; there is no collision here, and `e2e/hairline-verify.ts` measures the
rendered contrast, so a preset that ever collides fails loudly.

## The panel is a rail region, and it has exactly one owner

This is where the repo-wide **rail contract** was worked out, and the panel is
now one instance of it rather than its own rule. Read
[`primitives/css/rail`](../rail/CLAUDE.md) for the model. In panel terms: **one
box opens the region — `cp-panel`, as its own padding. Every other participant
either inherits the rail or cancels it, never both.**

- **Inherits** — a raw `<Input>`, a contributed `FieldRenderer`, a section
  label, any JSX a caller drops into a `Section`. It lands on the rail by doing
  *nothing*: no wrapper, no rail class, no opt-in. That is the whole point —
  content that knows nothing about the vocabulary is still aligned with it.
- **Cancels** — `cp-row` and `cp-rule`, and only they, and deliberately not
  `rail-bleed`: they stop `--cp-panel-pad` *short* of the rail's origin (the
  chrome gap a row's fill keeps from the panel edge) so the row's box reaches
  the panel's inner edge — that full-width hover / selected fill is what makes a
  row read as a *row* — then re-apply their own `--cp-row-pad-x`, not the rail,
  landing the leading cell back on exactly the rail the panel published. Two
  terms written out with a reason, which the contract allows; what it forbids is
  reaching for half of `rail-bleed`.
- **`cp-panel` publishes an *asymmetric* pair** (`--rail-start` ≠ `--rail-end`,
  below) directly rather than taking a step off the `rail-<step>` ramp — the
  documented custom-value case. It pays its own rail, so `--rail-owed-*` is
  `0px` and a `rail-follow` band dropped in a panel insets itself no further.

**The rail is the ICON rail**, and that is v2's correction. It used to be the
*text* rail — an interior column of the row grid, after the gutter and the icon
column — which meant a search field, a swatch cluster or a card grid was indented
26px past everything, the section label alone escaped by hanging back through a
`cp-rail-icon` class, and the panel padded **62px left against 12px right**.
Worse, what opened the icon column was not the loose content's business: one
leading glyph on one footer row moved every block in the panel. Now the panel's
content box starts where every row's icon, indicator and drag handle begins, so a
heading, a search field and a swatch grid share ONE left edge with the rows'
leading column, and only a row's LABEL indents past the icon column that is
actually there. `cp-rail-icon` was deleted rather than defaulted: it hung a label
back by `rail-icon − rail-text`, and with the panel's content edge now ON the
icon rail there is nothing left to hang back from — so this change removes a
member rather than adding one.

**What that trades away, knowingly.** On the text rail the panel's content box
was exactly a row's **content band** — aligned on BOTH sides, starting where
every row label starts and ending where a row's trailing cell ends. That was a
real property and it was not wrong; it answered a different question, namely
"where does a loose control line up with the row *text* around it?". It bought
that right-side symmetry by handing loose content an interior column of the row
grid. We take the left-edge symmetry instead — the heading is the edge — and
keep the end rail exactly where it was, so the right side is unchanged.

**The handle-less case is declared on `cp-panel`, never at `:root`.** A custom
property is substituted where it is *declared*, so a rail published at the root
freezes on the root's `--cp-rail-icon` — and the derived-track rule below, which
moves `--cp-rail-icon` on `.cp-panel`, never reaches it. Measured: root-declared,
a handle-less panel pads 36px left against 12px right; declared on the panel,
12/12. Both declarations must land on the same element.

Two cancellations have to stay exact, and both are one edit away from being
wrong:

- `cp-band`'s rule bleeds by the panel's **whole** inset (chrome pad plus content
  inset). Drop a term and every divider in the app either insets or overhangs.
  There is no padding to restore — the rule is its own empty box, not a wrapper
  around the band's content.
- A row's negative margins are paid back in its `width`
  (`calc(100% + start + end)`), not left to `width: auto` — a `<button>` host
  sizes to its content, so `auto` would shrink the row instead of filling it.

## The two leading tracks are derived from the panel's content

A track is reserved only when something in the **panel** occupies it: the gutter
by a drag handle, the icon column by an icon, a checkbox or a radio mark. **Not
by a switch** — its indicator is drawn in the *trailing* cell, so its leading
cell is empty by construction, and a panel of switches (fx-toggle,
metronome-button) reserved 18px that painted nothing and indented every label in
it by 26px. Each row marks its own occupants — `data-cp-handle` on the gutter
cell, `data-cp-icon` on the leading cell when that cell is genuinely occupied —
and `cp-panel` turns that into one template for every row in it via `:has()`.

The marker is **not** derived from whether the leading cell rendered a node: an
unchecked radio draws nothing yet still owns the column (its mark is *state*, the
track is not), so reading the node would re-flow the whole panel the first time
someone ticked a row.

Which is also why `icon` is excluded from *two* of the three selections rather
than all three. Check and radio own the leading cell; a switch does not, so
`icon` + `select="switch"` is a legal row — and has to be, or a surface that
wants a glyph beside a toggle puts it in the LABEL cell and knocks that row's
text off the rail. `ControlPanelStack`'s `display: contents` does not block the
scan; the stack renders inside the same `.cp-panel`.

Per **panel**, never per row. Deriving it per row is exactly the conditional
leading cell invariant #1 exists to delete: a row with an icon would indent its
label past a row without one.

Three things about the mechanism are one edit from being wrong:

- **Each case is its own `grid-template-columns`, never a zeroed width.**
  Dropping a track must drop the column gap that follows it too; a `0px` track
  keeps its gap and lands the rail 8px right of the panel's own inset.
- **The cell that lost its track is `display: none`d.** A row always renders four
  cells; an unhidden empty one auto-places into the track that took its place and
  shoves the label a column over.
- **The rules are nested inside the `@utility` blocks.** Tailwind's utilities
  layer comes after base, so a `@layer base` rule loses to `cp-row`'s own
  template however specific it is. `cp-rule` needs *two* handle-less templates
  (three-cell and `[data-span="field"]`), because a panel-scoped selector
  out-specifies the bare `&[data-span="field"]`.

## `ControlPanel.Row` is its own grid, not a composed `Row`

`css/row`'s `Row` is a `<Line>`-based **flex** row whose `icon` is a leading flex
child — so the label's x depends on whether that row happens to have an icon, and
flex has no track that occupies width when empty. That dependency *is* the
misalignment this vocabulary exists to remove. `Row`'s trailing slot is also
hover-revealed and overlay-pinned; a panel row's trailing cell is in-flow and
presentational by contract.

Adding a grid mode plus a panel-only geometry axis to a primitive with 50+ call
sites costs more than eight lines of duplicated element inference, so the two
stay separate and share **tokens** (`--pad-row-x`, `--control-height-md`, the
hover fill) rather than code.

What is *not* duplicated is the hover-reveal machinery. `ControlPanel.Row`'s
trailing cell is presentational by contract — the row itself is the click target,
so an interactive control there would be a nested one, and `select="switch"` owns
the cell rather than sharing it. `RuleRow` is the interactive case (its row box is
a non-interactive `<div>`), and its trailing cluster composes `row-actions` with
`pin={null}`: in-flow inside the reserved track, borrowing that primitive's reveal
coupling and xs density instead of restating them.

Host element is **inferred, never authored**: `href` → `<a>`,
`onSelect`/`disabled` → `<button>`, else `<div>`. Same rule as `Row`.

## Geometry: the `--cp-*` tokens

Declared at every theme-scope root in [`ui-kit`'s `app.css`](../ui-kit/web/theme/app.css)
— not inside the `@utility` block, because a custom property that reads a themed
var freezes its computed value wherever it is declared. The published
`--rail-start` is the one exception, and for the same reason read the other way:
it reads `--cp-rail-icon`, which `cp-panel` itself redeclares, so the two must be
declared on the same box or the rail freezes on the root's value.

| Token | Value | What it is |
| --- | --- | --- |
| `--cp-panel-pad` | `var(--space-xs)` | the chrome pad — the gap a row's fill keeps from the panel's edge |
| `--cp-row-pad-x` | `var(--pad-row-x)` | inline padding inside a row or rule row |
| `--cp-gutter` | `var(--space-lg)` | leading track that hangs the drag handle — present only in a panel where some row has one |
| `--cp-icon-gap` | `var(--space-sm)` | **the** column gap — shared by `cp-row` and `cp-rule`, which is what puts a rule's prefix cell on the same rail as a row's icon cell |
| `--cp-icon-col` | `1.125rem` | the icon / selection-indicator track — present only in a panel where some row has one |
| `--cp-prefix-col` | `4rem` | the builder's prefix track ("Where", "And", "then by") |
| `--cp-remove-col` | `1.5rem` | minimum of the builder's trailing track |
| `--cp-row-h` | `var(--control-height-md)` | one row height (invariant #2) |
| `--cp-rule-h` | `var(--control-height-lg)` | one builder-row height |
| `--cp-rail-icon` | `calc(row-pad-x + gutter + icon-gap)`, or `var(--cp-row-pad-x)` in a panel with no handle | THE rail — the left edge of a row's leading cell, and the panel's own content inset |

The formula includes `--cp-icon-gap` because the grid's column gap *follows* the
track it names: the icon cell begins one gap after the gutter track ends.
Dropping that term is the easy way to get a rail that is 8px wrong.

`cp-panel` then publishes that as the **shared** rail — the repo-wide pair, not
a panel-private one:

| Published | Value | |
| --- | --- | --- |
| `--rail-start` | `calc(panel-pad + rail-icon)` | where loose content lands, chrome pad included |
| `--rail-end` | `calc(panel-pad + row-pad-x)` | so the content box ends where a row's trailing cell does |

The rail is the **whole** padding, not just the content half: a rail means *where
a child that does nothing lands*, and a bare `<Input>` here lands past both terms.
Publishing only the content half would advertise a rail 4px short of the real one.
The chrome pad is recovered by the two cancellers, which stop short of the panel's
inner edge on purpose.

**There is no `--cp-rail-text`.** The text rail — where a row's label starts — is
an interior column of the row grid, reached by the row's own tracks, and nothing
outside a row has any business naming it; handing it to loose content is the
defect v2 removed.

`--cp-icon-col` and `--cp-prefix-col` are the only genuinely new numbers — they
are column widths, which the spacing ramp does not model. Everything else binds
to the density ramp, so panels tighten under the Compact preset. Row height binds
to `--control-height-md` so a panel row lines up with every Button, Input and
ToggleChip in the app, extending the rail past the panel's own edge.

Five utilities carry them: `cp-panel` (the region owner, and the box the two
leading tracks are derived on), `cp-body` + `cp-band` (the separator — one
mechanism, above), `cp-row` (gutter | icon | label | trailing, the first two
derived) and `cp-rule` (six tracks, with `[data-span="field"]` collapsing the
operator track for a builder that has none and the gutter derived the same way
as a row's). There is no `cp-rail-icon` utility: the panel's own rail IS the icon
rail, so content reaches it by doing nothing.

## `ControlPanelPopover` has no `width`, `padding` or `contentClassName`

That absence is the feature — those are exactly the props that let three panels
in one toolbar end up 481, 384 and 256px wide, each set by whatever was widest
inside it. `size` maps to a width **role** (`menu` = a list of choices,
`builder` = a six-track rule row, `picker` = a panel whose body is a grid), the
padding is the body's, and there is nowhere to smuggle a measurement through.

`maxHeight` **is** here, and is not that escape reopened: it is a passthrough of
`OverlayPanel`'s closed `PopoverMaxHeight` scale, invariant #5 is about *width*,
and fitting the viewport plus scrolling is already unconditional — so the prop
can only ever make a panel SHORTER than the space it has (a long Turn-into list
that would otherwise open as a viewport-tall wall). The three-panels-at-481/384/256px
failure a `width` prop caused has no height analogue.
`picker` (320px) exists because three shipped panels — the avatar picker, the
page icon button, the change-cover popover — arrived at that width
independently; one panel at a width is a measurement, three unrelated ones is a
role. Invariant #5 is enforceable because the
escape is absent from the type, not defaulted in it.

No `tooltip` prop either: the caller's trigger (typically an `IconButton`)
already owns its tooltip.

Children are wrapped in a `ControlPanel.Stack`, so `usePanelStack()` works inside
any panel opened this way — a sub-panel is a push, never a popover opened from
inside a popover. The stack is published through **context** (and throws rather
than no-ops when absent) because one of its three consumers, custom-columns'
per-field editor, is a nested contribution with no prop path back to the chrome
hosting the panel.

## Enforcement

`fixtures/` contributes the geometry fixtures to the layout-harness catalog,
swept at every width role (262 / 320 / 524) and measured in a real browser by
`./singularity check layout-geometry`: `rail-alignment` (invariant #1, across a
mixed row set — the panel's own inset against the row grid's leading cell, and
every row's label against a rail one of them computed), `mixed-content` (the same
rail, for content that is NOT a row — a bare `<Input>` and a `<Button>` measured
against a row's leading cell), `derived-tracks` (a panel with neither leading
track and a panel with only the gutter, so nothing is indented past a column
nothing paints in), `row-height`, `rule-grid` (both shapes), and `long-label` —
whose falsification re-renders the historical `absolute right-2` +
reserved-padding construct and asserts the overlap check genuinely fails on it.

Plus `region` — a **`RegionFixture`**, which says only "`ControlPanel` opens a
region" and lets the harness fill it from `REGION_CHILDREN` (bare input, bare
button, bare prose, a `display: contents` contribution, a `rail-follow` band, a
`rail-bleed` row). This file used to ask authors to "render something other than
a `Row`", because rows were the one child kind the gate ever drew and three
geometry bugs shipped past it; a region fixture has nowhere to say what its
children are, so the request is now a mechanism. Adding a member to the kit
re-gates this panel with no edit here.

`useRailGuard` (`primitives/css/rail/web`) is the same check in dev, on the real
DOM: it names any child of a live panel whose content does not start on the
published rail.

> The harness oracle compares **widths only**. `rigidIntegrity` on a row pins the
> row's box, not its height, so invariant #2 rests on `--cp-row-h` plus the unit
> test — the oracle has no height invariant to express it with. It is likewise
> structurally blind to COLOUR, which is why the separator needs its own check:

`e2e/hairline-verify.ts` (manual; drives the deployed Tasks toolbar) reads the
composited pixels in the blank gap between each pair of bands and asserts exactly
one row there differs from the panel's own rendered background by ≥10 per channel
— plus none above the first band. It is **self-falsifying**: it then paints
`.cp-band::before` transparent and re-probes, requiring the same strips to report
nothing, so a probe aimed at the wrong y cannot pass forever. The background is
read off the render (the strip's modal colour), not resolved from a token, so a
wrong `--chrome-mask` is caught as well.

`lint/no-adhoc-panel-body` flags the three ways a panel body sections itself by
hand: a `DropdownMenuSeparator` with no `DropdownMenu*Content` ancestor, a
`<Separator>` inside a floating panel surface, and an `h-px` + `bg-border`
hairline. It closes the *drift* signals, not the whole class — a body built from
`Stack` + `SectionLabel` + `Button` with no divider is invisible to it, which is
what the burndown allowlist in `lint/index.ts` is for.

The primitive needs **no** new lint exemptions: it inherits the
`plugins/primitives/plugins/css/plugins/**` layout glob already in
`css/lint/index.ts` and stays clean against everything else.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The control-panel vocabulary: ControlPanel plus its closed set of members (Section, Row, RuleList, RuleRow, Field, Footer, Empty, Stack) and the ControlPanelPopover surface. The container draws the hairlines, the row is a grid so every label starts at one x, selection has one language per meaning, and width is a role rather than a measurement.
- Web:
  - Uses:
    - `primitives/css/rail.useRailGuard`
    - `primitives/css/selection-indicator.CheckboxIndicator`
    - `primitives/css/switch.SwitchIndicator`
    - `primitives/css/text.SectionLabel`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.Popover`
    - `primitives/css/ui-kit.PopoverContent`
    - `primitives/css/ui-kit.PopoverMaxHeight`
    - `primitives/css/ui-kit.PopoverTrigger`
    - `primitives/icon-button.IconButton`
    - `primitives/row-actions.RowActions`
    - `primitives/row-actions.rowActionsAnchor`
  - Exports (types):
    - `ControlPanelEmptyProps`
    - `ControlPanelFieldProps`
    - `ControlPanelFooterProps`
    - `ControlPanelPopoverProps`
    - `ControlPanelProps`
    - `ControlPanelRowProps`
    - `ControlPanelRowSelect`
    - `ControlPanelRowTone`
    - `ControlPanelRuleListProps`
    - `ControlPanelRuleRowProps`
    - `ControlPanelSectionProps`
    - `ControlPanelSize`
    - `ControlPanelStackProps`
    - `PanelStackApi`
    - `PanelStackEntry`
  - Exports (values):
    - `ControlPanel`
    - `ControlPanelPopover`
    - `usePanelStack`
- Cross-plugin:
  - Imported by:
    - `apps/pages/page-tree`
    - `apps/sonata/audio/metronome`
    - `apps/sonata/piano-roll`
    - `apps/sonata/view-options`
    - `conversations/conversation-category`
    - `fields/date/filter`
    - `page/callout`
    - `page/container`
    - `page/editor`
    - `primitives/avatar`
    - `primitives/data-view`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/view-core`
    - `ui/theme-engine/quick-theme`
    - `ui/theme-toggle`

<!-- AUTOGENERATED:END -->

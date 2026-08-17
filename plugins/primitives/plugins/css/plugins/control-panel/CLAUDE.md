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
4. **Footers are rows**, never ghost buttons pinned to opposite corners.
5. **Width is a role, not a measurement.** A panel never resizes as its content
   changes.

They hold by construction, not by discipline: the row is a grid so #1 survives a
row with no icon, `RowProps` is a discriminated union so #3 is a type error, and
`ControlPanelPopover` has no width prop so #5 has nothing to override.

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

What the body **does** own is geometry: the content inset, the two rails, and
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

## The inset has exactly one owner

**One box applies the panel's content inset — `cp-panel`, as its own padding.
Every other participant either inherits it or cancels it, never both.**

- **Inherits** — a raw `<Input>`, a contributed `FieldRenderer`, any JSX a
  caller drops into a `Section`. It lands on the text rail by doing *nothing*:
  no wrapper, no rail class, no opt-in. That is the whole point — content that
  knows nothing about the vocabulary is still aligned with it.
- **Cancels** — `cp-row` and `cp-rule` bleed the inset back out with negative
  inline margins, so the row's box reaches the panel's inner edge (that
  full-width hover / selected fill is what makes a row read as a *row*), then
  re-insert their own `--cp-row-pad-x`, landing the label back on exactly the
  inset the panel applied. `cp-rail-icon` is the other canceller: it hangs a
  section label *back* one column to the icon rail.

The numbers make the panel's **content box** exactly a row's **content band** —
it starts on the text rail, where every row label starts, and ends where a row's
trailing cell ends. So a loose control lines up on the left with the labels above
and below it, and on the right with their trailing cells.

Two cancellations have to stay exact, and both are one edit away from being
wrong:

- `cp-band`'s rule bleeds by the panel's **whole** inset (chrome pad plus content
  inset). Drop a term and every divider in the app either insets or overhangs.
  There is no padding to restore — the rule is its own empty box, not a wrapper
  around the band's content.
- A row's negative margins are paid back in its `width`
  (`calc(100% + start + end)`), not left to `width: auto` — a `<button>` host
  sizes to its content, so `auto` would shrink the row instead of filling it.

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
var freezes its computed value wherever it is declared.

| Token | Value | What it is |
| --- | --- | --- |
| `--cp-panel-pad` | `var(--space-xs)` | the chrome pad — the gap a row's fill keeps from the panel's edge |
| `--cp-inset-start` | `var(--cp-rail-text)` | the content inset a row cancels; loose content lands here |
| `--cp-inset-end` | `var(--cp-row-pad-x)` | its trailing twin, so the content box ends where a row's trailing cell does |
| `--cp-row-pad-x` | `var(--pad-row-x)` | inline padding inside a row or rule row |
| `--cp-gutter` | `var(--space-lg)` | leading track that hangs the drag handle (empty on non-reorderable rows) |
| `--cp-icon-gap` | `var(--space-sm)` | **the** column gap — shared by `cp-row` and `cp-rule`, which is what puts a rule's prefix cell on the same rail as a row's icon cell |
| `--cp-icon-col` | `1.125rem` | the icon / selection-indicator track |
| `--cp-prefix-col` | `4rem` | the builder's prefix track ("Where", "And", "then by") |
| `--cp-remove-col` | `1.5rem` | minimum of the builder's trailing track |
| `--cp-row-h` | `var(--control-height-md)` | one row height (invariant #2) |
| `--cp-rule-h` | `var(--control-height-lg)` | one builder-row height |
| `--cp-rail-icon` | `calc(row-pad-x + gutter + icon-gap)` | the icon rail — where a section label starts |
| `--cp-rail-text` | `calc(rail-icon + icon-col + icon-gap)` | the text rail — where every row label starts |

Both rail formulas include `--cp-icon-gap` because the grid's column gap *follows*
the track it names: the icon cell begins one gap after the gutter track ends, and
the label cell one gap after the icon cell. Dropping that term is the easy way to
get a rail that is 8px wrong.

`--cp-icon-col` and `--cp-prefix-col` are the only genuinely new numbers — they
are column widths, which the spacing ramp does not model. Everything else binds
to the density ramp, so panels tighten under the Compact preset. Row height binds
to `--control-height-md` so a panel row lines up with every Button, Input and
ToggleChip in the app, extending the rail past the panel's own edge.

Six utilities carry them: `cp-panel` (the inset owner), `cp-body` + `cp-band` (the
separator — one mechanism, above), `cp-row` (gutter | icon | label | trailing),
`cp-rule` (six tracks, with `[data-span="field"]` collapsing the operator track
for a builder that has none), and `cp-rail-icon` — the hanging offset a section
label uses. There is no `cp-rail-text`: the text rail is where loose content
already sits.

## `ControlPanelPopover` has no `width`, `padding` or `contentClassName`

That absence is the feature — those are exactly the props that let three panels
in one toolbar end up 481, 384 and 256px wide, each set by whatever was widest
inside it. `size` maps to a width **role** (`menu` = a list of choices,
`builder` = a six-track rule row), the padding is the body's, and there is
nowhere to smuggle a measurement through. Invariant #5 is enforceable because the
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
swept at both width roles (262 / 524) and measured in a real browser by
`./singularity check layout-geometry`: `rail-alignment` (invariant #1, against
the rail tokens, across a mixed row set), `mixed-content` (the same rail, for
content that is NOT a row — a bare `<Input>` and a `<Button>` measured against a
row's label), `row-height`, `rule-grid` (both shapes), and `long-label` — whose
falsification re-renders the historical `absolute right-2` + reserved-padding
construct and asserts the overlap check genuinely fails on it.

**Any new fixture must render something other than a `Row`.** Rows were the one
child kind the gate ever drew, which is how three geometry bugs shipped past a
green suite.

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
    - `primitives/css/selection-indicator.CheckboxIndicator`
    - `primitives/css/switch.SwitchIndicator`
    - `primitives/css/text.SectionLabel`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.Popover`
    - `primitives/css/ui-kit.PopoverContent`
    - `primitives/css/ui-kit.PopoverTrigger`
    - `primitives/row-actions.RowActionButton`
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
    - `primitives/data-view`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/view-core`

<!-- AUTOGENERATED:END -->

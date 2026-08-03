# date-picker

The themed date-entry primitive. Before this plugin the only date UI in the repo
was the native `<input type="date">` — unthemeable, locale-opaque, and with no
place to put a relative preset ("Today") or a reminder time. Every surface that
needs a day now composes this instead.

## Local days, never UTC

**The one rule.** A "day" here is the user's *local* calendar day, and every
function in `core/` is written that way — via `Date` setters (`setDate`,
`setMonth`, `setHours`), never epoch arithmetic.

- `toISODay(d)` is **not** `d.toISOString().slice(0, 10)`. `toISOString` is UTC,
  so west of Greenwich every local evening serializes as the *next* day (and
  every early morning east of it as the *previous* one). That silent off-by-one
  is the bug class this module exists to close; `core/internal/day-math.test.ts`
  pins the divergence explicitly so nobody "simplifies" it back.
- `fromISODay(s)` returns local midnight, or `null` when `s` is not a
  well-formed calendar day. That `null` is a **parse predicate**, not an
  absorbed failure: the input is untrusted text (a stored operand, a URL param)
  and "not a date" is an expected answer the caller branches on. It also rejects
  syntactically valid but non-existent days (`2026-02-30`), which
  `new Date(y, m, d)` would otherwise roll silently into March.
- `addDays` survives DST because `setDate` re-resolves against the local
  calendar: on a spring-forward Sunday `+86_400_000` lands 23 hours later, i.e.
  still the *same* calendar day.
- `addMonths` **clamps** to the target month's length (Jan 31 + 1 month is
  Feb 28 / Feb 29), which is the one deliberate divergence from
  `fields/date/plugins/filter`'s `addUnits`. A raw `setMonth` overflows Feb 31
  into March 3 — invisible for that module's filter-window shift, but a visible
  bug for a month pager, which would skip February entirely.

`buildMonthGrid` always returns **6 rows × 7 days**, padded with adjacent-month
days. A month genuinely needs 4–6 rows, and a variable row count makes the
picker change height as you page — a reflow that moves everything below it.

## Why `Calendar` is separate from `DatePickerPanel`

Three consumers want three different amounts of the picker, so the pieces are
exported separately rather than behind one component with `showX` flags:

- **`Calendar`** — the bare month grid. The date-filter's "Exact date" section
  wants only this: it has its own *relative anchor* presets above it (which a
  calendar cannot express — see `fields/date/plugins/filter`) and no time
  concept. It seeds from `fromISODay(iso)` and emits `toISODay(day)`.
- **`TimeField`** — the clock half, a themed native `<input type="time">`.
  Native form controls are the documented exemption from `no-adhoc-control`;
  the platform's own 12h/24h locale handling and mobile time wheel are not worth
  re-deriving.
- **`DatePickerPanel`** — presets + calendar + optional time + optional Clear.
  The "whole picker" a chip or a cell editor opens.
- **`DatePickerPopover`** — the panel behind a trigger.

`DatePickerPanel` **controls the month** rather than letting `Calendar` keep its
own, so pressing a preset moves the visible month with it instead of leaving the
new selection off-screen. `Calendar` still supports the uncontrolled shape (omit
`month`/`onMonthChange`) for standalone use.

## Relative labels

`relativeDayLabel(date, now)` is the single source of the Today / Tomorrow /
Yesterday vocabulary, shared by the panel's preset row and the page editor's `@`
date menu, so the two can never disagree. `now` is a **required parameter** —
every caller already has the clock its surface renders against, and an implicit
`Date.now()` is what makes this kind of function untestable.

Do **not** merge it with `formatAnchor` in `fields/date/plugins/filter/core`.
That one labels a *relative anchor operand* (`{kind:"relative", unit, amount}` —
a rule that re-resolves as the clock advances); this one labels a *concrete
date*. They share three words and nothing else.

## Composition

Hand-rolled on the existing layout primitives — no new dependency, no vendored
shadcn `Calendar` (which would ship raw Tailwind tripping `no-adhoc-layout` /
`-spacing` / `-radius` and need rewriting anyway). The month grid *is*
`<Grid cols={7}>`; day cells are `<Button aspect="icon" shape="pill">` under a
`<ControlSizeProvider size="sm">`, so they follow the active theme's radius and
density tokens for free. The header is the canonical `Line` + `Fill` + rigid
`IconButton` row.

## Tests

`bun test plugins/primitives/plugins/date-picker/core` — pure day math and
labels: DST boundaries in both directions, `addMonths` clamping and rollover,
`buildMonthGrid`'s 6×7 invariant and week-start alignment, `toISODay` /
`fromISODay` round-trip over a full year, and `relativeDayLabel` at local
midnight edges. The suite is timezone-independent by construction and is run
under `TZ=America/Los_Angeles` (a negative offset with DST — the configuration
where the UTC bug class is visible at all).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Themed date-picker primitive: <Calendar> month grid, <TimeField> native clock input, <DatePickerPanel> (presets + calendar + time + clear), and <DatePickerPopover>. Day math lives in core/ and is local-calendar, never UTC.
- Web:
  - Uses:
    - `primitives/css/center.Center`
    - `primitives/css/cluster.Cluster`
    - `primitives/css/fill.Fill`
    - `primitives/css/grid.Grid`
    - `primitives/css/line.Line`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/css/ui-kit.Separator`
    - `primitives/icon-button.IconButton`
    - `primitives/popover.InlinePopover`
    - `primitives/popover.InlinePopoverProps`
  - Exports (types):
    - `CalendarProps`
    - `DatePickerPanelProps`
    - `DatePickerPopoverProps`
    - `TimeFieldProps`
  - Exports (values):
    - `Calendar`
    - `DatePickerPanel`
    - `DatePickerPopover`
    - `TimeField`
- Cross-plugin:
  - Imported by:
    - `fields/date/filter`
    - `fields/date/inline`
    - `page/inline-date`
- Core:
  - Exports (types): `RelativeDayLabel`
  - Exports (values):
    - `addDays`
    - `addMonths`
    - `buildMonthGrid`
    - `fromISODay`
    - `isSameDay`
    - `isSameMonth`
    - `monthTitle`
    - `normalizeWeekStart`
    - `relativeDayLabel`
    - `startOfDay`
    - `startOfMonth`
    - `toISODay`
    - `weekdayLabels`

<!-- AUTOGENERATED:END -->

# Inline-level layout primitive + start-side text truncation

_2026-06-18 — closes two gaps in the `css/*` layout-primitive set surfaced during the `no-adhoc-layout` burndown._

## The two gaps

1. **No inline-level layout primitive.** Every layout primitive (`Frame`, `Stack`,
   `Cluster`, `Center`, `Grid`) is block-level (`flex`/`grid`). A chip/icon that must sit
   **inline in a text run** — baseline-aligned, flowing with the surrounding text — has no
   primitive home, so callers keep an eslint-disabled raw `inline-flex`.
   - Offenders: `file-path.tsx` (the inline path chip wrapper) and `op-status-chip.tsx`
     (a lone inline icon inside a sidebar row's text flow).

2. **`TruncatingText` only ellipsizes at the end.** Path/identifier chips need **start-side**
   truncation (ellipsize the leading directories, keep the filename tail visible), so
   `file-path.tsx` hand-rolls `direction:rtl` + `text-overflow` + `overflow-hidden`/`whitespace-nowrap`
   with an eslint-disable.

Together: `file-path`'s 3 disables + `op-status-chip`'s 1.

## Design

### Gap 1 — `<Inline>` (new sub-plugin `css/inline`)

The **inline-level sibling of `Stack`**: an `inline-flex` flow row, baseline-aligned for
inline-in-text use. It **delegates to `Stack`** (exactly as `Cluster` does) so the gap ramp
and align/justify semantics stay defined in one place; it only overrides the display.

```tsx
export interface InlineProps extends React.HTMLAttributes<HTMLElement> {
  gap: SpaceStep;          // required — mirrors Stack ("the only way to space children")
  align?: StackAlign;      // default "center" (icon+label baseline of a chip)
  justify?: StackJustify;
  wrap?: boolean;
  as?: React.ElementType;  // default "span" (inline element, not div)
  ref?: React.Ref<HTMLElement>;
}
```

- Renders `<Stack direction="row" …>` with `className={cn("inline-flex align-baseline", className)}`.
  - `inline-flex` overrides Stack's block-level `flex` (tailwind-merge resolves the `display`
    group — later class wins), turning the box inline-level without duplicating the ramp maps.
  - `align-baseline` (`vertical-align: baseline`) is what makes the box sit on the surrounding
    text baseline — the exact recipe `Badge` already uses for inline-in-text chips.
- **No `min-w-0`.** The container constrains itself with `max-w-full` (allowed); the
  *truncation leaf* inside owns `min-w-0`. This keeps the "exactly one primitive owns
  `min-w-0`" invariant intact.

### Gap 2 — `TruncatingText` gains `side?: "end" | "start"`

One truncation leaf, two directions — not a second primitive (avoids fragmenting truncation).

- `side="end"` (default): unchanged — `min-w-0 truncate`. Zero change for all ~18 importers.
- `side="start"`: the RTL-ellipsis technique baked in:
  - host element gets `dir="rtl"` + `min-w-0 truncate text-left` (ellipsis moves to the visual
    start; `text-left` keeps the visible tail flush-left),
  - children wrapped in `<span dir="ltr" style={{ unicodeBidi: "embed" }}>` so the path itself
    reads left-to-right.
  - The `dir` **attribute** replaces the old inline `direction` style; `truncate` supplies the
    `text-overflow: ellipsis`. The only inline style left is `unicode-bidi: embed`, owned by the
    primitive (no Tailwind utility exists for it; not a layout concern).

`TruncatingText` also gains the standard `extends HTMLAttributes` + `...rest` + `ref`
passthrough every other `css/*` primitive already has, so it can render as the interactive
element itself (`as="button" onClick=…`) — letting the file-path button **be** the truncation
leaf instead of wrapping one.

## Migrations

- **`file-path.tsx`** → `<Inline gap="2xs" className="group/path max-w-full">` wrapping a
  `<TruncatingText as="button" side="start" …>` (the path button IS the leaf) + the rigid
  `CopyButton`. Removes all 3 disables. The Frame `meta` track (`minmax(0,1fr)`) that hosts it
  in collapsible-card already supplies the shrink context; `max-w-full` caps it elsewhere.
- **`op-status-chip.tsx`** → `<Inline gap="none" className="text-muted-foreground">` around the
  lone icon. Removes the 1 disable.

## Out of scope / notes

- `Stack` is left untouched (load-bearing, imported everywhere) — `Inline` composes it rather
  than adding an `inline` prop to it.
- No `app.css` `@utility` for left-truncate — the inline `unicode-bidi` lives inside the
  primitive, self-contained.

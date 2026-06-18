# Column — the vertical named-slot layout primitive (column twin of Frame)

Date: 2026-06-18

## Problem

`FloatingAction` exposes its morphing panel as a bare `flex` container (via
`panelClassName`). Consumers that need a canonical **rigid header / scrollable
body / rigid footer** column have to hand-roll the column-fill mechanics on the
panel's direct children, each behind an `eslint-disable layout/no-adhoc-layout`:

- rigid header → `shrink-0`
- scroll body → `min-h-0 flex-1 overflow-y-auto`
- rigid footer → `shrink-0`

`message-toc.tsx` carries 3 such disables. More broadly there is **no vertical
`rigid | flexible | rigid` layout primitive** — the column twin of the row
`Frame` — that this panel and every other sticky-header / scroll-body / footer
surface (panes, dialogs, sidebars, tabbed views) could compose. The absence is
why each surface re-derives the column-fill mechanics by hand (PaneChrome,
tabbed-view, data-view, pages-sidebar, favorites-sidebar, story-editor all do).

## Design — `Column`

A new `css/*` layout primitive, sibling of `Frame`, at
`plugins/primitives/plugins/css/plugins/column/`. Where `Frame` is the
**named-slot row** (`leading | content | meta | trailing`, CSS-grid columns,
shrink hierarchy baked in), `Column` is the **named-slot column**
(`header | body | footer`, flex column, the rigid/flexible/rigid fill policy
baked in).

### Why flex (not grid)

`Frame` uses grid because the *row* shrink hierarchy (content truncates last,
meta first) needs grid track sizing. `Column`'s requirement is simpler and is
the textbook flex-column: rigid header, growing+scrolling body, rigid footer —
which is exactly what `Scroll`'s `fill` (`min-h-0 flex-1 overflow-y-auto`) was
built for. Flex keeps the body's `Scroll` composition **honest**: `fill` is
semantically correct in a flex column, whereas in a grid cell its `flex-1` would
be inert. So `Column` owns `flex flex-col` + the rigid (`shrink-0`) header/footer
roles, and **delegates the scroll body to the existing `Scroll` primitive**
(composition, like `Frame` delegates truncation to `TruncatingText`). `Scroll`
stays the single owner of `overflow`; `min-w-0`/`min-h-0` stay leaf decisions.

### API

```ts
export interface ColumnProps extends React.HTMLAttributes<HTMLElement> {
  header?: ReactNode;            // rigid top region (shrink-0)
  body?: ReactNode;              // flexible middle region; scrolls by default
  footer?: ReactNode;            // rigid bottom region (shrink-0)
  scrollBody?: boolean;          // default true — wrap body in <Scroll axis="y" fill>
  fill?: boolean;                // default false — min-h-0 flex-1 to fill a flex-col parent
  gap?: SpaceStep;               // default "none" — regions are usually flush
  as?: React.ElementType;        // default "div"
  ref?: React.Ref<HTMLElement>;
  // className composes last
}
```

Render:

```tsx
<As ref={ref}
    className={cn("flex flex-col", GAP_CLASS[gap], fill && "min-h-0 flex-1", className)}
    {...rest}>
  {header != null && <div className="shrink-0">{header}</div>}
  {body   != null && (scrollBody
    ? <Scroll axis="y" fill>{body}</Scroll>
    : <div className="min-h-0 flex-1">{body}</div>)}
  {footer != null && <div className="shrink-0">{footer}</div>}
</As>
```

- **`fill`** mirrors `Scroll`/`Clip`'s `fill` exactly — the established
  "`min-h-0 flex-1` to fill a flex parent" idiom. Needed when `Column` is itself
  a flex child whose height is externally clamped (the FloatingAction morph
  panel's `max-h` transition).
- **`scrollBody=false`** yields a plain flexible region for bodies that manage
  their own overflow (e.g. embedded `data-view`).

### Naming

`Column` + the self-documenting `header/body/footer` slots read unambiguously:
`<Column header={…} body={…} footer={…} />`. The slots distinguish it from a
plain vertical stack. A miller-internal `Column` component exists but is
plugin-private (Miller-columns domain) and never barrel-exported, so there is no
module collision (imports are fully-qualified by path).

## Integration: `message-toc`

The FloatingAction panel stays a generic flex container; `Column` becomes its
single `fill` child. The panel keeps `flex-col` (so the `fill` child fills
height) and its morph dimensions; `Column` owns the region structure.

```tsx
<FloatingAction
  className="absolute top-2 right-3 z-nav"   // positioning disable stays (FloatingAction API)
  anchor="top-right"
  panelClassName="flex-col w-[3.25rem] group-data-open/fa:w-56 max-h-[1.625rem] group-data-open/fa:max-h-80"
>
  <Column
    fill
    header={<Frame gap="xs" className="px-sm py-xs group-data-open/fa:border-b group-data-open/fa:border-border/40" leading={…} trailing={…} />}
    body={<FloatingActionFadeIn>{entries.map(…)}</FloatingActionFadeIn>}
    footer={<FloatingActionFadeIn><button …/></FloatingActionFadeIn>}
  />
</FloatingAction>
```

This removes all 3 column-related `eslint-disable`s. The `FloatingActionFadeIn`
wrappers keep only their opacity-fade role; the scroll moves into `Column`'s
`Scroll` body cell, the `shrink-0`s into `Column`'s rigid wrappers. The single
remaining disable is the wrapper *positioning* className, which is inherent to
FloatingAction's API and unrelated to the column problem.

`prompt-templates` is **not** migrated: its panel uses `flex-col-reverse`
(always-visible icon at the bottom, content grows upward) with an inner
`<Scroll>` — not a header/body/footer rigid column. It is not a `Column` shape.

## Scope & follow-ups

In scope now: create `Column`; migrate `message-toc`; update the `css` skill doc.

Deliberately **out of scope** (these are load-bearing primitives this agent must
not modify, and the migration is mechanical): file follow-up tasks to adopt
`Column` in `PaneChrome` (pane), `tabbed-view`, `data-view`, `pages-sidebar`,
`favorites-sidebar`, `story-editor` — each currently hand-rolls
`min-h-0 flex-1 overflow-y-auto` inside a flex column. Each is a one-surface
burndown that `Column` now makes a drop-in.

## Testing

- A vitest DOM test (`web/__tests__/`) asserting the structural contract: header
  wrapper is `shrink-0`, body is a `Scroll` region by default (and plain
  flexible when `scrollBody={false}`), footer wrapper is `shrink-0`, and `fill`
  applies `min-h-0 flex-1` to the root.
- Manual: Playwright screenshot of the message-toc TOC open/closed in a
  conversation to confirm the morph, scroll, and footer still behave.

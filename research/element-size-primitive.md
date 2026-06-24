# Shared element-size (ResizeObserver) primitive

## Problem

The "measure an element reactively via ResizeObserver" idiom is hand-rolled in
≥12 places with inconsistent cleanup, initial-measure, dedup, and node-swap
handling. A measurement/cleanup bug must be fixed N times.

## Solution

A new cross-plugin primitive `plugins/primitives/plugins/element-size/`
(web-only, hook-only — mirrors the `latest-ref` precedent) exposing:

```ts
export type ElementSize = { width: number; height: number };

// Reactive size. Callback-ref based (handles mount/unmount/node-swap).
// `target` getter lets you attach the ref to one node but measure another
// (e.g. `(el) => el.offsetParent` for the floating dock).
function useElementSize<T extends HTMLElement = HTMLElement>(
  target?: (el: T) => Element | null | undefined,
): [(node: T | null) => void, ElementSize];

// Substrate: run `onResize` when the observed element(s) resize.
// - target: RefObject | RefObject[] | getter (→ Element | Element[] | null)
// - synchronous initial measure (no first-paint flash; required by the
//   expandable jsdom test which stubs a no-op observer)
// - RAF-debounced observer callbacks by default (avoids RO-loop warnings)
// - `deps` forces a re-measure when caller params change
function useResizeObserver(
  target: ResizeTarget,
  onResize: () => void,
  options?: { debounce?: boolean; deps?: React.DependencyList },
): void;
```

`useElementSize` is built on `useResizeObserver`. Both stabilise `onResize` via
`useEventCallback` (the `latest-ref` primitive) so the observer never re-subscribes
on closure churn.

### Measurement API

`useElementSize` uses `getBoundingClientRect()` (fractional, transform-aware) —
the most general choice, matching the floating-dock + scaled-iframe call sites.
The piano-roll local copy used `contentRect` (excludes padding/border); its host
div has no padding so the swap is behavior-equivalent.

## Migration map

| Call site | Maps to |
|---|---|
| surface/floating `use-element-size` | becomes the primitive; consumer imports it; local file deleted |
| sonata/piano-roll local `useElementSize` | `useElementSize()` |
| prototypes/gallery `scaled-iframe` | `useElementSize()` + derive scale |
| expandable | `useResizeObserver(contentRef, recompute, {deps:[collapsedHeight]})` |
| collapsible-wrap | `useResizeObserver(wrapRef, recompute, {deps:[rows,gap,expanded]})` |
| responsive-overflow | `useResizeObserver(getter→[container,ancestor], recompute)` |
| data-view/gallery `use-grid-columns` | `useResizeObserver` (callback-ref/probe) |
| pane `OverflowActionsBar` | `useResizeObserver(containerRef, recompute, {deps:[totalCount]})` |
| graph-canvas | `useResizeObserver(containerRef, refit, {deps:[fitKey,focusId,fitView]})` |
| terminal | `useResizeObserver(containerRef, () => fitAddon.fit())` |
| screenshot `ImageStage` | `useResizeObserver([containerRef,imgRef], measure, {deps:[url,naturalSize]})` |
| reorder `ReorderInner` | `useResizeObserver(()=>sentinel.parentElement, recompute)` |

Any site that cannot migrate cleanly is added to the lint allowlist with a
comment + a filed follow-up task (no shoehorning).

## Lint rule

`plugins/framework/plugins/tooling/plugins/lint/plugins/resize-observer-safety/`
→ `no-raw-resize-observer`: flags `new ResizeObserver(...)` outside the primitive
(allowlist: the primitive internal file + the barrel-import polyfill stub).
Steers future usage through the primitive.

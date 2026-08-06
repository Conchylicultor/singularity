/**
 * The three upward DOM walks that every consumer of the lineage grammar needs:
 * recognizing a producer's marker span, and resolving the nearest build-stamped
 * source / owner *past* those spans.
 *
 * They live here rather than inside `collect-meta.ts` because they are not the
 * token builder's business — they are the grammar's. A second consumer
 * (`reports/render-loop`, attributing a render loop to a culprit component)
 * needs exactly these, and a hand-rolled copy is how the two previously diverged:
 * a discriminator keyed on `data-slot-id` misses `<UiRegion>` entirely and
 * therefore reports `ui-region.tsx` as the source of everything inside a miller
 * column or a full-pane.
 */

/** The `display:contents` spans the lineage producers inject (the slot-item
 * marker middleware, `<UiRegion>`) are not real layout elements — they only
 * carry markers — so they're skipped in the selector path.
 *
 * Keyed on `data-lineage`, the grammar's discriminator, so it covers BOTH
 * producers. This is load-bearing, not cosmetic: each producer's span is JSX in
 * its own source file, so it also carries a build-stamped `data-source` /
 * `data-ui-owner`. Recognizing only one producer would make `nearestSource` /
 * `nearestOwner` / `preciseSelector` report the *producer's* file for every pick
 * beneath it. */
export function isMarkerSpan(el: Element): boolean {
  return el instanceof HTMLElement && el.dataset.lineage !== undefined;
}

/** The nearest build-stamped `data-source` (repo-relative `file:line`) above the
 * element, skipping the marker middleware's own `display:contents` span — that span
 * is JSX in marker-middleware.tsx so it ALSO carries a `data-source` pointing at the
 * middleware, which would mis-attribute every pick. */
export function nearestSource(el: Element): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    const m: HTMLElement | null = cur.closest<HTMLElement>("[data-source]");
    if (!m) return undefined;
    if (!isMarkerSpan(m)) return m.dataset.source;
    cur = m.parentElement;
  }
  return undefined;
}

/** The nearest `data-ui-owner` (`Name@file:line`) above the element — the
 * composing component that owns the picked element. A component callsite stamp
 * rides the composed primitive's `{...props}` spread onto the host, so this
 * resolves e.g. `LaunchControl` even though it authors no host element of its own
 * (the leaf primitive's file is reported separately by `nearestSource`). Skips the
 * marker middleware's `display:contents` span the same way (it carries no owner,
 * but may sit between the picked element and the owner-bearing host). */
export function nearestOwner(el: Element): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    const m: HTMLElement | null = cur.closest<HTMLElement>("[data-ui-owner]");
    if (!m) return undefined;
    if (!isMarkerSpan(m)) return m.dataset.uiOwner;
    cur = m.parentElement;
  }
  return undefined;
}

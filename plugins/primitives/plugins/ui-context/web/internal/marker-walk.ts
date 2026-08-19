/**
 * The three upward DOM walks that every consumer of the lineage grammar needs:
 * recognizing a boxless lineage marker, and resolving the nearest build-stamped
 * source / owner *past* those markers.
 *
 * They live here rather than inside `collect-meta.ts` because they are not the
 * token builder's business — they are the grammar's. A second consumer
 * (`reports/render-loop`, attributing a render loop to a culprit component)
 * needs exactly these, and a hand-rolled copy is how the two previously diverged:
 * a discriminator keyed on `data-slot-id` misses `<UiRegion>` entirely and
 * therefore reports `ui-region.tsx` as the source of everything inside a miller
 * column or a full-pane.
 */

/** True for a lineage element that generates no box of its own — `<UiRegion>`'s
 * span, and a contribution box on a slot that draws no layout cell. Such an
 * element is JSX in the framework file that mints it, so it carries a
 * build-stamped `data-source` / `data-ui-owner` of its own; walking *through* it
 * is what keeps `nearestSource` / `nearestOwner` / `preciseSelector` from
 * reporting the framework's file for everything beneath it.
 *
 * Keyed on {@link BOXLESS_ATTR}, NOT on `data-lineage`: a lineage marker is no
 * longer always boxless. A slot stamps a contribution's identity onto the very
 * cell it lays that contribution out with — a real element the user can point
 * at, whose own source and selector segment are the honest answer for a pick on
 * it. */
export function isBoxlessMarker(el: Element): boolean {
  return el instanceof HTMLElement && el.dataset.lineageBoxless !== undefined;
}

/** The nearest build-stamped `data-source` (repo-relative `file:line`) above the
 * element, skipping boxless lineage markers — each is JSX in the framework file
 * that mints it, so it ALSO carries a `data-source` pointing there, which would
 * mis-attribute every pick beneath it. */
export function nearestSource(el: Element): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    const m: HTMLElement | null = cur.closest<HTMLElement>("[data-source]");
    if (!m) return undefined;
    if (!isBoxlessMarker(m)) return m.dataset.source;
    cur = m.parentElement;
  }
  return undefined;
}

/** The nearest `data-ui-owner` (`Name@file:line`) above the element — the
 * composing component that owns the picked element. A component callsite stamp
 * rides the composed primitive's `{...props}` spread onto the host, so this
 * resolves e.g. `LaunchControl` even though it authors no host element of its own
 * (the leaf primitive's file is reported separately by `nearestSource`). Skips the
 * boxless lineage markers the same way (they carry no owner, but may sit between
 * the picked element and the owner-bearing host). */
export function nearestOwner(el: Element): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    const m: HTMLElement | null = cur.closest<HTMLElement>("[data-ui-owner]");
    if (!m) return undefined;
    if (!isBoxlessMarker(m)) return m.dataset.uiOwner;
    cur = m.parentElement;
  }
  return undefined;
}

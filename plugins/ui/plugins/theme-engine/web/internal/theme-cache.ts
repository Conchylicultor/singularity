// localStorage cache of the resolved theme CSS, written by ThemeInjector on every
// change and replayed by the inline pre-paint script in web-core/index.html before
// first paint, so a warm reload paints the correct theme on frame 0. Sibling to
// active-scope-storage (the existing pre-paint precedent).
//
// The envelope is intentionally generic: a { styleId -> cssText } map plus the
// resolved color mode. The replay script knows only this shape and the key — no
// token / group / preset knowledge — so web-core stays theme-agnostic (boundary
// rule R10). styleId is `theme-engine-${groupId}`, matching the ids ThemeInjector
// uses so React adopts the replayed <style> elements in place.

const KEY = "theme-engine:critical-css";

export interface CriticalCssEnvelope {
  /** Envelope version — bump to invalidate incompatible caches. */
  v: 1;
  /** Sorted live token-group ids, for staleness detection by the reader. */
  groups: string[];
  /** styleId (`theme-engine-<group>`) → full `:root{…}.dark{…}` CSS text. */
  styles: Record<string, string>;
  /** Resolved color mode at write time, replayed as the `.dark` class. */
  dark: boolean;
}

export function writeCriticalCss(envelope: CriticalCssEnvelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(envelope));
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // Quota exceeded / storage disabled — the cache is a best-effort first-paint
    // optimization; a miss degrades to the neutral cold floor, never breaks.
  }
}

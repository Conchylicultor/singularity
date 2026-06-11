// localStorage cache of the resolved theme CSS, written by ThemeInjector on every
// change and replayed by the inline pre-paint script in web-core/index.html before
// first paint, so a warm reload paints the correct theme on frame 0. Sibling to
// active-scope-storage (the existing pre-paint precedent).
//
// The envelope is intentionally generic: a map of per-app-path entries, each a
// { styleId -> cssText } map plus the CONFIGURED color mode. The replay script
// knows only this shape, the key, and the `theme-engine-<group>` id convention —
// no token / group / preset knowledge — so web-core stays theme-agnostic (boundary
// rule R10). styleId matches the ids ThemeInjector uses so React adopts the
// replayed <style> elements in place.
//
// Why per-app-path: with per-app forked themes, the cache must replay the theme of
// the app being loaded, not whichever app last wrote. The replay script longest-
// prefix matches location.pathname against the entry keys (mirroring apps'
// appMatchesPath), falling back to the "" (global) entry. An unforked app's
// resolved CSS *is* the global theme, so it writes both its own key and "".
//
// Why the configured mode (not a resolved dark bit): storing "light"|"dark"|"system"
// lets the replay script re-resolve "system" against live matchMedia on every load,
// so an OS appearance flip between sessions still paints the right scheme.

const KEY = "theme-engine:critical-css";

export type CachedColorMode = "light" | "dark" | "system";

export interface PaintCacheEntry {
  /** styleId (`theme-engine-<group>`) → full `:root{…}.dark{…}` CSS text. */
  styles: Record<string, string>;
  /** Configured color mode; the replay script re-resolves "system" each load. */
  mode: CachedColorMode;
}

export interface CriticalCssEnvelope {
  /** Envelope version — bump to invalidate incompatible caches. */
  v: 2;
  /** App path ("/agents", "/files", …) → entry. Key "" is the global theme. */
  entries: Record<string, PaintCacheEntry>;
}

function read(): CriticalCssEnvelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const env = JSON.parse(raw) as CriticalCssEnvelope;
      if (env && env.v === 2 && env.entries) return env;
    }
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // Corrupt / unavailable / pre-v2 cache — start fresh; the runtime path is
    // authoritative and rewrites the whole envelope below.
  }
  return { v: 2, entries: {} };
}

// Merge one app's resolved CSS into the per-app envelope (read-merge-write so other
// apps' entries survive — only one app is mounted per page). An unforked app also
// owns the "" global entry; a forked app must never clobber it.
export function writeCriticalCss(opts: {
  appPath: string | undefined;
  styles: Record<string, string>;
  mode: CachedColorMode;
  forked: boolean;
}): void {
  const { appPath, styles, mode, forked } = opts;
  try {
    const env = read();
    const entry: PaintCacheEntry = { styles, mode };
    env.entries[appPath ?? ""] = entry;
    if (appPath && !forked) env.entries[""] = entry;
    localStorage.setItem(KEY, JSON.stringify(env));
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // Quota exceeded / storage disabled — the cache is a best-effort first-paint
    // optimization; a miss degrades to the neutral cold floor, never breaks.
  }
}

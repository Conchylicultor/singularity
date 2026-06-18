// localStorage cache of the resolved theme CSS, written by ThemeInjector on every
// change and replayed by the inline pre-paint script in web-core/index.html before
// first paint, so a warm reload paints the correct theme on frame 0.
//
// The envelope is intentionally generic: a map of per-app-path entries, each a
// { styleId -> cssText } map plus the CONFIGURED color mode. The replay script
// knows only this shape, the key, and the `theme-engine-<group>` id convention —
// no token / group / preset knowledge — so web-core stays theme-agnostic (boundary
// rule R10). styleId matches the ids ThemeInjector uses so React adopts the
// replayed <style> elements in place.
//
// Why per-app-path: with per-app themes, the cache must replay the theme of the
// app being loaded, not whichever app last wrote. The replay script longest-
// prefix matches location.pathname against the entry keys (mirroring apps'
// appMatchesPath), falling back to the "" (global) entry.
//
// Who owns the "" (global) entry: now that `:root` carries the FOCUSED full-
// surface app's theme (the "base layer owns `:root`" model), the "" entry must
// hold the *desktop/global* theme, written only when the focus is global
// (desktop/floating → `rootIsGlobal`). A full-surface app focus renders its own
// theme into `:root` and writes only its own app-path key; it must NOT clobber
// "" (else a later cold load of a different path would replay this app's theme as
// the global fallback). See writeCriticalCss.
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
  v: 3;
  /** App path ("/agents", "/files", …) → entry. Key "" is the global theme. */
  entries: Record<string, PaintCacheEntry>;
}

function read(): CriticalCssEnvelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const env = JSON.parse(raw) as CriticalCssEnvelope;
      if (env && env.v === 3 && env.entries) return env;
    }
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // Corrupt / unavailable / pre-v3 cache — start fresh; the runtime path is
    // authoritative and rewrites the whole envelope below.
  }
  return { v: 3, entries: {} };
}

// Merge one app's resolved CSS into the per-app envelope (read-merge-write so other
// apps' entries survive — only one app is mounted per page). The "" (global) entry
// is owned ONLY by a global focus (`rootIsGlobal` — desktop/floating): in that case
// `:root` carries the desktop theme, so it is the correct fallback for any path. A
// full-surface app focus (rootScopeId set → `rootIsGlobal` false) renders its OWN
// theme into `:root` and writes only its own app-path key; it must never clobber ""
// with an app-specific theme.
export function writeCriticalCss(opts: {
  appPath: string | undefined;
  styles: Record<string, string>;
  mode: CachedColorMode;
  rootIsGlobal: boolean;
}): void {
  const { appPath, styles, mode, rootIsGlobal } = opts;
  try {
    const env = read();
    const entry: PaintCacheEntry = { styles, mode };
    env.entries[appPath ?? ""] = entry;
    if (rootIsGlobal) env.entries[""] = entry;
    localStorage.setItem(KEY, JSON.stringify(env));
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // Quota exceeded / storage disabled — the cache is a best-effort first-paint
    // optimization; a miss degrades to the neutral cold floor, never breaks.
  }
}

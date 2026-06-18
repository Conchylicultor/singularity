// Module-level pre-paint cache aggregator. A true cross-React-subtree singleton —
// the right home because the cache is a localStorage side effect. The style
// emitters that must feed the cache live in DIFFERENT React subtrees and cannot
// share a context:
//   - ThemeInjector (Core.Root) — the `:root`/`.dark` blocks (the focused full-
//     surface app's theme, or the desktop/global theme when focus is global).
//   - ScopedAppTheme (one per registered app, mounted centrally via AppScopeThemes
//     at Core.Root) — the `[data-theme-scope="app:<id>"]` blocks for OTHER visible
//     surfaces whose theme differs from `:root`.
// A React context (the old CssReportContext) only spanned ThemeInjector's
// subtree, so scoped blocks were excluded from the pre-paint cache and only
// injected at runtime via useLayoutEffect — the flicker / "global instead of
// app" bug on warm reload. This singleton aggregates EVERY reported style (both
// `theme-engine-*` global ids and `theme-scope-*` scoped ids) into one Map, then
// writes the full map into the active app-path entry of the localStorage
// envelope replayed before first paint.
//
// Flush timing: every GroupStyle reports from its layout effect. React runs all
// layout effects of one commit synchronously, so a single debounced microtask
// scheduled after the first report in a commit observes every style of that
// commit → no torn cache. (The old `map.size < groupCount` guard is gone: it
// assumed only the global groups report and cannot express "all groups × all
// mounted scopes".)
//
// Prune: replay-injected `theme-engine-*` / `theme-scope-*` elements whose owning
// GroupStyle is NOT mounted this session (a removed token group, or a scope no
// longer open after reload) must be removed so they don't declare dead vars.
// Each mounted GroupStyle CLAIMS its id in its layout effect; a prune pass
// scheduled as a following microtask removes any matching `<style>` element whose
// id is not claimed. Because claims happen in the layout effect and prune is a
// later microtask, every claim of the current commit is registered before prune
// runs — so a still-mounted element is never removed. (Replay-injected elements
// are adopted in place by getElementById(id) in GroupStyle's effect before any
// prune could touch them.)

import { writeCriticalCss, type CachedColorMode } from "./theme-cache";

interface PaintContext {
  appPath: string | undefined;
  mode: CachedColorMode;
  rootIsGlobal: boolean;
}

// styleId → cssText for every currently-mounted GroupStyle (global + scoped).
const styles = new Map<string, string>();
// styleIds claimed by a currently-mounted GroupStyle this session (prune set).
const claimed = new Set<string>();
// The active app path / configured mode / root-scope ownership, set by ThemeInjector.
let context: PaintContext = {
  appPath: undefined,
  mode: "system",
  rootIsGlobal: true,
};

let flushScheduled = false;
let pruneScheduled = false;

/**
 * Set the active paint context (active app path, configured mode, and whether the
 * focused `:root` is the global/desktop theme — which keys the "" entry ownership).
 */
export function setPaintContext(next: PaintContext): void {
  const changed =
    next.appPath !== context.appPath ||
    next.mode !== context.mode ||
    next.rootIsGlobal !== context.rootIsGlobal;
  context = next;
  // Re-flush when the context changes even if no style text did — e.g. switching
  // to an app with an identical theme, a root-scope change, or a configured-mode
  // change.
  if (changed) scheduleFlush();
}

/**
 * Report (upsert) or remove (text === null) one style's CSS text, and schedule a
 * debounced flush. No-op if the text is unchanged, to avoid redundant flushes.
 */
export function reportPaintStyle(styleId: string, text: string | null): void {
  if (text === null) {
    if (!styles.delete(styleId)) return;
  } else if (styles.get(styleId) === text) {
    return;
  } else {
    styles.set(styleId, text);
  }
  scheduleFlush();
}

/** Claim a styleId for the prune set (called from a mounted GroupStyle's effect). */
export function claimPaintStyle(styleId: string): void {
  claimed.add(styleId);
  schedulePrune();
}

/** Release a styleId from the prune set (GroupStyle cleanup). */
export function releasePaintStyle(styleId: string): void {
  claimed.delete(styleId);
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flush);
}

function flush(): void {
  flushScheduled = false;
  const snapshot: Record<string, string> = {};
  for (const [id, text] of styles) snapshot[id] = text;
  writeCriticalCss({
    appPath: context.appPath,
    styles: snapshot,
    mode: context.mode,
    rootIsGlobal: context.rootIsGlobal,
  });
}

function schedulePrune(): void {
  if (pruneScheduled) return;
  pruneScheduled = true;
  queueMicrotask(prune);
}

// Remove orphaned replay-injected <style> elements no live GroupStyle claims.
// Runs as a microtask after the commit's layout effects, so all current claims
// are already registered (the never-remove-a-live-element invariant).
function prune(): void {
  pruneScheduled = false;
  for (const el of document.querySelectorAll<HTMLStyleElement>(
    'style[id^="theme-engine-"], style[id^="theme-scope-"]',
  )) {
    if (!claimed.has(el.id)) el.remove();
  }
}

// Test-only: reset the module singleton between cases.
export function __resetPaintCacheAggregatorForTest(): void {
  styles.clear();
  claimed.clear();
  context = { appPath: undefined, mode: "system", rootIsGlobal: true };
  flushScheduled = false;
  pruneScheduled = false;
}

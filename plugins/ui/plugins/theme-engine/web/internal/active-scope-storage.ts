// The active app's FORKED theme scope, persisted across hard reloads.
//
// Matching a pathname to its `app:<id>` scope needs the apps registry and the
// current URL — neither reachable before React mounts. Rather than re-derive it
// in the pre-paint boot task, ThemeInjector writes the resolved scope here on
// every app switch and the boot task reads it back synchronously. Only forked
// scopes are stored (an unforked app reloads to global with no extra fetch), so
// a present value always means "this app has a fork worth pre-hydrating".
const KEY = "theme-engine:active-forked-scope";

export function persistActiveForkedScope(scopeId: string | undefined, forked: boolean): void {
  if (scopeId && forked) {
    localStorage.setItem(KEY, scopeId);
  } else {
    // Current app is unforked (or none) → clear, so a reload of it doesn't
    // hydrate a stale scope from a previously-viewed forked app.
    localStorage.removeItem(KEY);
  }
}

export function readActiveForkedScope(): string | undefined {
  return localStorage.getItem(KEY) ?? undefined;
}

// The app this browser tab last had focused, kept across a reload so the
// reload's re-publish of the same app is not counted as a launch. Per tab
// (sessionStorage): a new tab starts fresh, and its first app IS a launch.
const KEY = "app-usage:last-app";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch (err) {
    // Storage blocked (privacy mode, sandboxed frame): every first app of a
    // page load then counts as a launch — a slight over-count, not a failure.
    if (err instanceof DOMException) return null;
    throw err;
  }
}

export function readLastApp(): string | undefined {
  return storage()?.getItem(KEY) ?? undefined;
}

export function writeLastApp(appId: string): void {
  storage()?.setItem(KEY, appId);
}

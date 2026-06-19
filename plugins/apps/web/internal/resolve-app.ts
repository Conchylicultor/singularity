import { stripBasePath } from "@plugins/primitives/plugins/pane/web";
import type { ActiveApp } from "./use-active-app";

/** Path-prefix match: an app owns `pathname` if it equals or parents it. */
function appMatchesPath(appPath: string, pathname: string): boolean {
  return pathname === appPath || pathname.startsWith(appPath + "/");
}

/**
 * The registered app whose `path` best matches `pathname` (longest path wins,
 * so `/studio` beats `/` for `/studio/foo`). No fallback — returns undefined
 * when nothing matches, so callers that need the "is this a real app route"
 * signal (e.g. apps-layout's canonicalization redirect) still get it. Shared by
 * {@link useActiveApp} and {@link resolveAppForPath}.
 */
export function matchAppForPath(
  pathname: string,
  apps: readonly ActiveApp[],
): ActiveApp | undefined {
  const sorted = [...apps].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((a) => appMatchesPath(a.path, pathname));
}

/**
 * The fallback app for routes that match no registered app and for initial boot:
 * the app that declared `default: true`, else the first registered app. Returns
 * undefined only when no apps are registered. Generic over contributions — the
 * apps core never names a specific contributor; an app opts in via its own
 * `Apps.App({ default: true })`.
 */
export function defaultApp(
  apps: readonly ActiveApp[],
): ActiveApp | undefined {
  return apps.find((a) => a.default) ?? apps[0];
}

export interface ResolvedApp {
  app: ActiveApp;
  /** App-local route path (base path stripped) to feed `parseUrl`. */
  routePath: string;
}

/**
 * Resolve a root-relative `pathname` to the app that should own it AND the
 * app-local route path to load. Every app owns its `path` prefix and all its
 * deep links live under it (e.g. agent-manager's `/agents/c/:id`), so pure
 * longest-prefix matching resolves everything — no catch-all app. Returns
 * undefined when nothing matches (the caller decides what to do, e.g. redirect
 * to the launcher).
 *
 * THE single source of truth for "which tab does this URL belong to", used by
 * the sanctioned cross-app `navigate()` so the focused tab's `appId` can never
 * drift from the URL.
 */
export function resolveAppForPath(
  pathname: string,
  apps: readonly ActiveApp[],
): ResolvedApp | undefined {
  const matched = matchAppForPath(pathname, apps);
  if (!matched) return undefined;
  return { app: matched, routePath: stripBasePath(pathname, matched.path) };
}

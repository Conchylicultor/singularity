// Load-tier partition — the pure function that splits the web plugin registry
// into the **eager substrate** (chrome, providers, boot tasks, every app's
// shell) and the **deferred app content** loaded after first paint.
//
// The whole point (see
// research/2026-07-02-cold-deeplink-boot-saturation-deferred-loading.md): the
// boot effect used to `loadPlugins(webEntries)` over all ~643 chunks before it
// could paint or even construct the notifications socket — ~8s of route-
// independent main-thread saturation. Deferring app *content* (which only ever
// renders inside its own app surface) shrinks the eager set to what the chrome
// actually needs, so the socket + first paint land seconds sooner.
//
// The rule is a pure function of `pluginPath` — no runtime knowledge, so it is
// trivially unit-testable (see load-tiers.test.ts) and the concatenated
// `webEntries` stays the single source of truth (the partition is derived, so
// `--composition` builds and the plugin-load smoke test are unaffected).

// Deferral is OPT-IN per app: only an app whose dir is listed here has its
// *content* deferred; every other app (and all shared substrate) stays eager,
// so the default is byte-for-byte today's behavior. This conservative allowlist
// is the safe floor while the general safety net is built (see follow-up #1):
// an app is safe to defer ONLY if nothing in the EAGER tier depends, at boot, on
// a registration its content provides. Where an app has a single such coupling,
// the offending *content* plugin is pinned eager via EAGER_EXCEPTIONS (below) and
// the app is still deferred (sonata does exactly this — see EAGER_EXCEPTIONS).
// One app remains fully EXCLUDED because the coupling is diffuse, not a single
// pinnable plugin:
//   • studio — the boot-critical `release.history` / `release.previews` resource
//     WEB descriptors register only as a side effect of studio's release content
//     importing `@plugins/release/core`; deferring it leaves boot-snapshot unable
//     to hydrate them.
// The default app (agent-manager) is also kept eager so cold boot into the
// primary surface is unchanged. Follow-up #1 replaces this hand-maintained list
// with codegen that auto-keeps any plugin carrying a boot-critical descriptor,
// a config web-registration, or a Core.Root/Core.Boot contribution eager — which
// makes safe default-deferral possible and dissolves both the allowlist below
// and EAGER_EXCEPTIONS.
export const DEFERRABLE_APPS = new Set<string>([
  "browser",
  "debug",
  "deploy",
  "file-explorer",
  "home",
  "mail",
  "pages",
  "prototypes",
  "settings",
  "sonata",
  "story",
  "workflows",
]);

// App-content plugins that a boot-eager surface hard-depends on and that MUST
// therefore load at boot despite living under a deferrable app. Two coupling
// classes require this today:
//   • a `Core.Root` / `Core.Boot` global always-mounted contribution — the mail
//     app-wide headless sync listener (a `Core.Root` watcher that must run
//     regardless of which app is focused).
//   • a `ConfigV2.WebRegister` an EAGER app shell reads at mount — sonata's
//     `voicing` plugin's web runtime exists solely to register `voicingConfig`,
//     which the eager `SonataProvider` reads via `useConfig` at mount; without it
//     the shell throws "descriptor has no web registration". Pinning just this
//     leaf keeps the other ~48 sonata plugins deferred.
// Each entry is dissolved by follow-up #1 (codegen auto-eager). Values are plugin
// dir paths (no `/web` suffix), matched verbatim against `pluginPath`.
export const EAGER_EXCEPTIONS = new Set<string>([
  "apps/plugins/mail/plugins/sync/plugins/auto-resume",
  "apps/plugins/sonata/plugins/voicing",
]);

// `apps/plugins/<app>/plugins/<child>` — captures the app dir and `<child>`, the
// first path segment of app *content* under it. Anything shallower (an app
// umbrella barrel, or a non-`apps/` plugin) does not match and stays eager.
const APP_CONTENT = /^apps\/plugins\/([^/]+)\/plugins\/([^/]+)/;

/**
 * True IFF `pluginPath` is deferrable app content: it lives under a
 * {@link DEFERRABLE_APPS} app as `apps/plugins/<app>/plugins/<child>/…` with
 * `<child> !== "shell"` and not in {@link EAGER_EXCEPTIONS}. Everything else —
 * framework, primitives, apps-core, shell, ui/theme, config, fields, shared
 * domains, non-deferrable apps, AND each deferrable app's own `shell` subtree
 * (which registers the rail icon + the app's root layout) — is eager.
 */
export function isDeferredPluginPath(pluginPath: string): boolean {
  const m = APP_CONTENT.exec(pluginPath);
  // Not app content (framework / primitives / shared domains / app umbrella) → eager.
  if (!m) return false;
  const app = m[1]!;
  const child = m[2]!;
  // Only explicitly-allowlisted apps defer; every other app stays eager.
  if (!DEFERRABLE_APPS.has(app)) return false;
  // The app's `shell` subtree registers `Apps.App` (rail icon + root layout) and
  // must be present at boot so the rail and the app skeleton paint immediately.
  if (child === "shell") return false;
  // Enumerated global-contribution exceptions stay eager.
  if (EAGER_EXCEPTIONS.has(pluginPath)) return false;
  return true;
}

/**
 * Split registry entries into `{ eager, deferred }` by {@link isDeferredPluginPath}.
 * Order-preserving within each tier and total (every input lands in exactly one
 * tier), so the concatenation source of truth is fully reconstructable.
 */
export function partitionWebEntries<T extends { pluginPath: string }>(
  entries: T[],
): { eager: T[]; deferred: T[] } {
  const eager: T[] = [];
  const deferred: T[] = [];
  for (const e of entries) {
    if (isDeferredPluginPath(e.pluginPath)) deferred.push(e);
    else eager.push(e);
  }
  return { eager, deferred };
}

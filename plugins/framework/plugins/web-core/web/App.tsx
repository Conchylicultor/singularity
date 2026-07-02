import { useState, useEffect } from "react";
import {
  PluginProvider,
  Core,
  loadPlugins,
  partitionWebEntries,
  markDeferredPluginsLoaded,
  markDeferredLoadComplete,
  UNSAFE_unsealSlotComponent,
} from "@plugins/framework/plugins/web-sdk/core";
import type { LoadedPlugin, PluginLoadError } from "@plugins/framework/plugins/web-sdk/core";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  NotificationsProvider,
  ensureNotificationsClient,
} from "@plugins/primitives/plugins/live-state/web";
import { yieldToMain } from "@plugins/primitives/plugins/perfs/plugins/scheduler/web";
import { startBootSpan, markBootInstant } from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";
import { webEntries } from "@composition-web-registry";
import { PluginLoadErrors } from "./components/plugin-load-errors";

// The concrete registry-entry type (`{ pluginPath, id, loader, dependsOn }`) —
// carries the non-optional `id` we need to map a loaded plugin back to its path.
type WebEntry = (typeof webEntries)[number];

// Deferred plugin chunks evaluated per batch before yielding the main thread.
// Small enough that one batch never monopolizes the thread (so the queued
// leader-election socket grant + paint can interleave), large enough that the
// whole deferred tier still drains quickly.
const DEFERRED_BATCH_SIZE = 24;

// Run every Core.Boot readiness task once, before the plugins register, so they
// can hydrate caches the initial render depends on (e.g. config — replacing
// per-component Suspense). Enumerated from the raw contributions because
// PluginProvider (and useContributions) isn't mounted yet. A failing or hung
// task must never brick boot: allSettled + log, then proceed regardless — reads
// degrade to their own fallbacks and self-heal via the WS shortly after.
async function runBootTasks(plugins: LoadedPlugin[]): Promise<void> {
  const tasks = plugins.flatMap((p) =>
    (p.contributions ?? []).filter((c) => c._slotId === Core.Boot.id),
  );
  if (tasks.length === 0) return;
  const results = await Promise.allSettled(
    tasks.map((t) => (t as unknown as { run: () => Promise<void> }).run()),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[boot] Core.Boot task failed", r.reason);
    }
  }
}

// Derive the deep-linked app's root prefix (`apps/plugins/<app>/`) from the
// current URL and the eager-loaded `Apps.App` contributions, so the deferred
// loader can front-load that app's content. We read the RAW contributions (the
// plugins have loaded but PluginProvider hasn't stamped `_pluginId` yet), so we
// recover each contribution's owning `pluginPath` via the entry `id → pluginPath`
// map. Returns null when the URL matches no app (e.g. bare `/`), leaving every
// deferred entry in the order-preserving "rest" tier.
function resolveActiveAppPrefix(
  eagerPlugins: LoadedPlugin[],
  eagerEntries: WebEntry[],
): string | null {
  const idToPath = new Map(eagerEntries.map((e) => [e.id, e.pluginPath] as const));
  const apps: { path: string; pluginPath: string }[] = [];
  for (const p of eagerPlugins) {
    const pluginPath = idToPath.get(p.id);
    if (!pluginPath) continue;
    for (const c of p.contributions ?? []) {
      if (c._slotId === "apps.app" && typeof c.path === "string") {
        apps.push({ path: c.path, pluginPath });
      }
    }
  }
  // Longest-path-prefix match against the URL — inlined rather than reusing
  // apps-core's matchAppForPath, whose `ActiveApp` param is the *sealed*
  // contribution shape (its `component` is opaque), which fights our raw
  // unsealed contributions. The match logic is identical (see resolve-app.ts).
  const pathname = window.location.pathname;
  const matched = [...apps]
    .sort((a, b) => b.path.length - a.path.length)
    .find((a) => pathname === a.path || pathname.startsWith(a.path + "/"));
  if (!matched) return null;
  // The matched contribution's pluginPath is the app's shell dir
  // (apps/plugins/<app>/plugins/shell); the app root prefix is
  // apps/plugins/<app>/ — all its deferred content lives under it.
  const m = /^(apps\/plugins\/[^/]+)\//.exec(matched.pluginPath);
  return m ? m[1] + "/" : null;
}

function RootRenderer() {
  const roots = Core.Root.useContributions();
  return (
    <>
      {roots.map((r, i) => {
        // UNSAFE: Core.Root is framework bootstrap; web-sdk/core can't import
        // slot-render; isolation is the manual PluginErrorBoundary here.
        const RootComponent = UNSAFE_unsealSlotComponent(r.component);
        return (
          <PluginErrorBoundary key={i} slot="core.root">
            <RootComponent />
          </PluginErrorBoundary>
        );
      })}
    </>
  );
}

interface LoadedState {
  plugins: LoadedPlugin[];
  errors: PluginLoadError[];
}

export default function App() {
  const [state, setState] = useState<LoadedState | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Append a freshly-loaded batch to the live state with a NEW array reference
    // so PluginProvider's useMemo re-derives and registers only the newcomers
    // (runRegisterPhase is idempotent via its `registered` WeakSet), then publish
    // the loaded ids on the deferred-load signal for the layout host.
    const appendPlugins = (plugins: LoadedPlugin[], errors: PluginLoadError[]) => {
      setState((prev) =>
        prev
          ? { plugins: [...prev.plugins, ...plugins], errors: [...prev.errors, ...errors] }
          : { plugins, errors },
      );
      markDeferredPluginsLoaded(plugins.map((p) => p.id));
    };

    const loadDeferredBatch = async (batch: WebEntry[]): Promise<void> => {
      if (batch.length === 0) return;
      // Partial failure is tolerable (loadPlugins uses allSettled + collects
      // errors), so a broken app-content chunk never aborts the tier.
      const { plugins, errors } = await loadPlugins(batch);
      if (cancelled) return;
      // Run any Core.Boot tasks these plugins contribute (none under apps/ today,
      // but correct + future-proof) before they register, mirroring the eager
      // path so hydration lands before the slot re-render.
      await runBootTasks(plugins);
      if (cancelled) return;
      appendPlugins(plugins, errors);
    };

    void (async () => {
      // Layer 1 — Transport hoist. Construct the notifications singleton NOW,
      // before any plugin evaluation, so its leader-election lock request is
      // queued at t≈0 and the socket opens during a loadPlugins await gap instead
      // of ~8s later. NotificationsProvider reuses this same singleton.
      ensureNotificationsClient();

      // Layer 3 — partition the registry into the eager substrate (chrome,
      // providers, app shells) and deferred app content.
      const { eager, deferred } = partitionWebEntries(webEntries);

      // Eager tier: load → boot tasks → paint. Chrome renders and
      // NotificationsProvider mounts (the socket is already warming from Layer 1).
      const endLoad = startBootSpan("load-plugins", "scripts", "loadPlugins (eager)");
      const eagerResult = await loadPlugins(eager);
      endLoad();
      const endBoot = startBootSpan("boot-tasks", "boot-tasks", "runBootTasks (eager)");
      await runBootTasks(eagerResult.plugins);
      endBoot();
      markBootInstant("set-state", "paint", "App setState (first render)");
      if (cancelled) return;
      setState({ plugins: eagerResult.plugins, errors: eagerResult.errors });

      // Layer 3 — deferred tier, AFTER first paint (never blocks chrome).
      // Active-app-first: front-load the deep-linked app's content as one awaited
      // priority batch, then drain the rest in yielding idle batches.
      const activePrefix = resolveActiveAppPrefix(eagerResult.plugins, eager);
      const priority: WebEntry[] = [];
      const rest: WebEntry[] = [];
      for (const e of deferred) {
        if (activePrefix && e.pluginPath.startsWith(activePrefix)) priority.push(e);
        else rest.push(e);
      }

      await loadDeferredBatch(priority);
      for (let i = 0; i < rest.length && !cancelled; i += DEFERRED_BATCH_SIZE) {
        await loadDeferredBatch(rest.slice(i, i + DEFERRED_BATCH_SIZE));
        // Breathe between batches so the queued socket grant + input + paint can
        // interleave instead of being starved by a long evaluation run.
        await yieldToMain();
      }
      if (cancelled) return;
      markDeferredLoadComplete();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  return (
    <>
      {state.errors.length > 0 && <PluginLoadErrors errors={state.errors} />}
      <NotificationsProvider>
        <PluginProvider plugins={state.plugins}>
          <RootRenderer />
        </PluginProvider>
      </NotificationsProvider>
    </>
  );
}

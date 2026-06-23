import { useState, useEffect } from "react";
import {
  PluginProvider,
  Core,
  loadPlugins,
  UNSAFE_unsealSlotComponent,
} from "@plugins/framework/plugins/web-sdk/core";
import type { LoadedPlugin, PluginLoadError } from "@plugins/framework/plugins/web-sdk/core";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { NotificationsProvider } from "@plugins/primitives/plugins/live-state/web";
import { startBootSpan, markBootInstant } from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";
import { webEntries } from "@composition-web-registry";
import { PluginLoadErrors } from "./components/plugin-load-errors";

// Run every Core.Boot readiness task once, before first paint, so plugins can
// hydrate caches the initial render depends on (e.g. config — replacing
// per-component Suspense). Enumerated from the raw contributions because
// PluginProvider (and useContributions) isn't mounted yet. A failing or hung
// task must never brick boot: allSettled + log, then render regardless — reads
// degrade to their own fallbacks and self-heal via the WS shortly after.
async function runBootTasks(plugins: LoadedPlugin[]): Promise<void> {
  const tasks = plugins.flatMap((p) =>
    (p.contributions ?? []).filter((c) => c._slotId === Core.Boot.id),
  );
  const results = await Promise.allSettled(
    tasks.map((t) => (t as unknown as { run: () => Promise<void> }).run()),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[boot] Core.Boot task failed", r.reason);
    }
  }
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
    void (async () => {
      const endLoad = startBootSpan("load-plugins", "scripts", "loadPlugins");
      const result = await loadPlugins(webEntries);
      endLoad();
      const endBoot = startBootSpan("boot-tasks", "boot-tasks", "runBootTasks");
      await runBootTasks(result.plugins);
      endBoot();
      markBootInstant("set-state", "paint", "App setState (first render)");
      if (!cancelled) setState(result);
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

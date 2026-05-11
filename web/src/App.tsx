import { useState, useEffect } from "react";
import { PluginProvider, Core, loadPlugins } from "@core";
import type { PluginDefinition, PluginLoadError } from "@core";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { NotificationsProvider } from "@plugins/primitives/plugins/live-state/web";
import { pluginEntries } from "./plugins";
import { PluginLoadErrors } from "./components/plugin-load-errors";

function RootRenderer() {
  const roots = Core.Root.useContributions();
  return (
    <>
      {roots.map((r, i) => (
        <PluginErrorBoundary key={i} slot="core.root">
          <r.component />
        </PluginErrorBoundary>
      ))}
    </>
  );
}

interface LoadedState {
  plugins: PluginDefinition[];
  errors: PluginLoadError[];
}

export default function App() {
  const [state, setState] = useState<LoadedState | null>(null);

  useEffect(() => {
    loadPlugins(pluginEntries).then(setState);
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

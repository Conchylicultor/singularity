import { useState, useEffect } from "react";
import {
  PluginProvider,
  Core,
  loadPlugins,
  UNSAFE_unsealSlotComponent,
} from "@plugins/framework/plugins/web-sdk/core";
import type { PluginDefinition, PluginLoadError } from "@plugins/framework/plugins/web-sdk/core";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { NotificationsProvider } from "@plugins/primitives/plugins/live-state/web";
import { webEntries } from "@plugins/framework/plugins/web-sdk/core/web.generated";
import { PluginLoadErrors } from "./components/plugin-load-errors";

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
  plugins: PluginDefinition[];
  errors: PluginLoadError[];
}

export default function App() {
  const [state, setState] = useState<LoadedState | null>(null);

  useEffect(() => {
    void loadPlugins(webEntries).then(setState);
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

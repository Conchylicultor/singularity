import { PluginProvider, PluginErrorBoundary, Core } from "@core";
import { plugins } from "./plugins";

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

export default function App() {
  return (
    <PluginProvider plugins={plugins}>
      <RootRenderer />
    </PluginProvider>
  );
}

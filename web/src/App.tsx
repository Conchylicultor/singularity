import { PluginProvider, Core } from "@core";
import { plugins } from "./plugins";

function RootRenderer() {
  const roots = Core.Root.useContributions();
  return (
    <>
      {roots.map((r, i) => (
        <r.component key={i} />
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

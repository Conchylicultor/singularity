import { it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PluginProvider, loadPlugins } from "@core";
import type { PluginDefinition } from "@core";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { pluginEntries } from "../plugins";

const SIDEBAR_SLOTS = new Set(["shell.sidebar"]);
const SHELL_SLOTS = new Set(["core.root"]);

function Wrapper({
  slotId,
  children,
  plugins,
}: {
  slotId: string;
  children: React.ReactNode;
  plugins: PluginDefinition[];
}) {
  let content = <>{children}</>;
  if (SIDEBAR_SLOTS.has(slotId)) {
    content = <SidebarProvider>{content}</SidebarProvider>;
  }
  if (SHELL_SLOTS.has(slotId)) {
    content = <TooltipProvider>{content}</TooltipProvider>;
  }
  return <PluginProvider plugins={plugins}>{content}</PluginProvider>;
}

it("plugin contributions render without crashing", async () => {
  const { plugins, errors } = await loadPlugins(pluginEntries);
  expect(errors).toHaveLength(0);
  for (const plugin of plugins) {
    for (const contribution of plugin.contributions ?? []) {
      const slotId = (contribution as Record<string, unknown>)
        ._slotId as string;
      const Component = (contribution as Record<string, unknown>).component as
        | React.ComponentType
        | undefined;

      if (!Component) continue;

      expect(() => {
        render(
          <Wrapper slotId={slotId} plugins={plugins}>
            <Component />
          </Wrapper>,
        );
      }).not.toThrow();
    }
  }
});

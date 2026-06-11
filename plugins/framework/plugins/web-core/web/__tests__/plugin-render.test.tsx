import { SidebarProvider, TooltipProvider } from "@plugins/primitives/plugins/ui-kit/web";
import { it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PluginProvider, loadPlugins } from "@plugins/framework/plugins/web-sdk/core";
import type { LoadedPlugin } from "@plugins/framework/plugins/web-sdk/core";
import { webEntries } from "@plugins/framework/plugins/web-sdk/core/web.generated";

const SIDEBAR_SLOTS = new Set(["shell.sidebar"]);
const SHELL_SLOTS = new Set(["core.root"]);

function Wrapper({
  slotId,
  children,
  plugins,
}: {
  slotId: string;
  children: React.ReactNode;
  plugins: LoadedPlugin[];
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
  const { plugins, errors } = await loadPlugins(webEntries);
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

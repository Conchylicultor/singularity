import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PluginProvider } from "@core";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { plugins } from "../plugins";

/** Slots whose components need SidebarProvider context. */
const SIDEBAR_SLOTS = new Set(["shell.sidebar"]);

/** Slots that render the full shell (which brings its own providers). */
const SHELL_SLOTS = new Set(["core.root"]);

function Wrapper({
  slotId,
  children,
}: {
  slotId: string;
  children: React.ReactNode;
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

describe("plugin contributions render without crashing", () => {
  for (const plugin of plugins) {
    for (const contribution of plugin.contributions ?? []) {
      const slotId = (contribution as Record<string, unknown>)
        ._slotId as string;
      const Component = (contribution as Record<string, unknown>).component as
        | React.ComponentType
        | undefined;

      if (!Component) continue;

      it(`${plugin.name} > ${slotId}`, () => {
        expect(() => {
          render(
            <Wrapper slotId={slotId}>
              <Component />
            </Wrapper>,
          );
        }).not.toThrow();
      });
    }
  }
});

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { PluginErrorBoundary } from "@core";
import { Shell as ShellCommands } from "../commands";
import { Shell } from "../slots";
import type { PaneDescriptor } from "../commands";
import { Toaster } from "./toaster";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

function ToolbarItem(item: {
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  component?: React.ComponentType;
}) {
  if (item.component) {
    const Comp = item.component;
    return <Comp />;
  }
  if (item.onClick) {
    return (
      <Button variant="ghost" size="sm" onClick={item.onClick}>
        {item.icon && <item.icon className="size-4" />}
        {item.label}
      </Button>
    );
  }
  return null;
}

let nextPaneId = 0;

export function ShellLayout() {
  const sidebars = Shell.Sidebar.useContributions();
  const mains = Shell.Main.useContributions();
  const toolbarItems = Shell.Toolbar.useContributions();
  const statusBarItems = Shell.StatusBar.useContributions();

  const [panels, setPanels] = useState<
    Array<{ id: string } & PaneDescriptor>
  >([]);

  ShellCommands.OpenPane.useHandler((descriptor) => {
    const id = `pane-${nextPaneId++}`;
    setPanels([{ id, ...descriptor }]);
    return id;
  });

  ShellCommands.Toast.useHandler(({ title, description, variant }) => {
    const opts = { description: title ? description : undefined };
    const message = title ?? description;
    const fn = variant && variant !== "default" ? toast[variant] : toast;
    fn(message, opts);
  });

  return (
    <>
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            {sidebars.map((pane, i) => (
              <Fragment key={pane.title}>
                {i > 0 && <Separator className="mx-2 w-auto bg-sidebar-border" />}
                <PluginErrorBoundary slot="shell.sidebar" label={pane.title}>
                  <SidebarGroup>
                    <SidebarGroupLabel>
                      <pane.icon className="size-4 mr-2" />
                      {pane.title}
                    </SidebarGroupLabel>
                    <pane.component />
                  </SidebarGroup>
                </PluginErrorBoundary>
              </Fragment>
            ))}
          </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="flex items-center border-b px-4 h-12 gap-1">
            <SidebarTrigger />
            {toolbarItems.map((item, i) => (
              <Fragment key={i}>
                {i > 0 && item.group !== toolbarItems[i - 1]!.group && (
                  <div className="flex-1" />
                )}
                <PluginErrorBoundary slot="shell.toolbar">
                  <ToolbarItem {...item} />
                </PluginErrorBoundary>
              </Fragment>
            ))}
          </header>

          <main className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {mains.map((panel) => (
                <PluginErrorBoundary key={panel.title} slot="shell.main" label={panel.title}>
                  <panel.component />
                </PluginErrorBoundary>
              ))}
              {panels.map((panel) => (
                <PluginErrorBoundary key={panel.id} slot="shell.pane" label={panel.id}>
                  <panel.component />
                </PluginErrorBoundary>
              ))}
            </ScrollArea>
          </main>

          {statusBarItems.length > 0 && (
            <footer className="flex items-center border-t px-4 h-6 text-xs text-muted-foreground">
              {statusBarItems.map((item, i) => (
                <PluginErrorBoundary key={i} slot="shell.statusbar">
                  <item.component />
                </PluginErrorBoundary>
              ))}
            </footer>
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
    <Toaster />
    </>
  );
}

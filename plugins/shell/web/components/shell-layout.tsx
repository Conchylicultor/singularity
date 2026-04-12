import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PluginErrorBoundary } from "@core";
import { Shell as ShellCommands } from "../commands";
import { Shell } from "../slots";
import { matchRoute } from "../routing";
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
  SidebarHeader,
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
  const toolbarItems = Shell.Toolbar.useContributions();
  const statusBarItems = Shell.StatusBar.useContributions();
  const routes = Shell.Route.useContributions();

  const [panels, setPanels] = useState<
    Array<{ id: string } & PaneDescriptor>
  >([]);

  const openPane = (descriptor: PaneDescriptor) => {
    const id = `pane-${nextPaneId++}`;
    setPanels([{ id, ...descriptor }]);
    return id;
  };

  ShellCommands.OpenPane.useHandler((descriptor) => {
    const id = openPane(descriptor);
    if (descriptor.path) {
      history.pushState({}, "", descriptor.path);
    }
    return id;
  });

  // Resolve current URL on mount
  const initialRouteResolved = useRef(false);
  useEffect(() => {
    if (initialRouteResolved.current || routes.length === 0) return;
    initialRouteResolved.current = true;

    const pathname = window.location.pathname;

    for (const route of routes) {
      const params = matchRoute(route.pattern, pathname);
      if (params) {
        openPane(route.resolve(params));
        return;
      }
    }
  }, [routes]);

  // Handle back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const pathname = window.location.pathname;
      for (const route of routes) {
        const params = matchRoute(route.pattern, pathname);
        if (params) {
          openPane(route.resolve(params));
          return;
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [routes]);

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
          <SidebarHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <img src="/icon.svg" alt="Singularity" className="size-7" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">Singularity</span>
                <span className="text-[10px] text-muted-foreground leading-none">Agent Manager</span>
              </div>
            </div>
          </SidebarHeader>
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
          <header className="flex items-center border-b px-3 h-12 gap-2 bg-background">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
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

          <main className="flex-1 overflow-hidden bg-muted/30">
            <ScrollArea className="h-full">
              {panels.map((panel) => (
                <PluginErrorBoundary key={panel.id} slot="shell.pane" label={panel.id}>
                  <panel.component />
                </PluginErrorBoundary>
              ))}
            </ScrollArea>
          </main>

          <footer className="flex items-center border-t px-4 h-7 text-xs text-muted-foreground gap-3">
            {statusBarItems.length > 0 ? (
              statusBarItems.map((item, i) => (
                <PluginErrorBoundary key={i} slot="shell.statusbar">
                  <item.component />
                </PluginErrorBoundary>
              ))
            ) : (
              <span className="opacity-50">Singularity</span>
            )}
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
    <Toaster />
    </>
  );
}

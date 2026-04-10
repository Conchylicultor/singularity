import { Fragment, useState } from "react";
import { toast } from "sonner";
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
import { ThemeToggle } from "./theme-toggle";

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
                <SidebarGroup>
                  <SidebarGroupLabel>
                    <pane.icon className="size-4 mr-2" />
                    {pane.title}
                  </SidebarGroupLabel>
                  <pane.component />
                </SidebarGroup>
              </Fragment>
            ))}
          </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="flex items-center justify-between border-b px-4 h-12">
            <div className="flex items-center gap-1">
              <SidebarTrigger />
              {toolbarItems.map((item) => (
                <Button
                  key={item.label}
                  variant="ghost"
                  size="sm"
                  onClick={item.onClick}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Button>
              ))}
            </div>
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {mains.map((panel) => (
                <panel.component key={panel.title} />
              ))}
              {panels.map((panel) => (
                <panel.component key={panel.id} />
              ))}
            </ScrollArea>
          </main>

          {statusBarItems.length > 0 && (
            <footer className="flex items-center border-t px-4 h-6 text-xs text-muted-foreground">
              {statusBarItems.map((item, i) => (
                <item.component key={i} />
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

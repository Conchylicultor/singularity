import type { ReactNode } from "react";
import type { RenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
export type AppShellSidebarItem = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
};

export type AppShellToolbarItem = {
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  component?: React.ComponentType;
  group?: string;
};

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

export function AppShellLayout({
  sidebarSlot,
  toolbarSlot,
  header,
  children,
}: {
  /**
   * The left sidebar's item slot. **Optional** — omit for an app with no
   * sidebar; the sidebar (and its trigger in the toolbar) is then not rendered.
   */
  sidebarSlot?: RenderSlot<AppShellSidebarItem>;
  /**
   * The top toolbar's item slot. **Optional** — omit for an app with no
   * toolbar; the toolbar header bar is then not rendered.
   */
  toolbarSlot?: RenderSlot<AppShellToolbarItem>;
  /** Brand/header content for the top of the sidebar. Only shown with a sidebar. */
  header?: ReactNode;
  /**
   * The main-area content — the app's chosen layout renderer
   * (e.g. `<MillerColumns/>`, `<FullPane/>`, or `<PaneLayoutHost/>`). Chrome
   * (sidebar + toolbar) and renderer are orthogonal and each opt-in: an app
   * supplies only the chrome regions it wants plus its renderer. With neither
   * slot, the shell collapses to a transparent full-surface host.
   */
  children: ReactNode;
}) {
  const toolbar = toolbarSlot && (
    <header className="flex items-center border-b px-3 h-12 gap-2 bg-background overflow-hidden">
      {sidebarSlot && (
        <>
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
        </>
      )}
      <toolbarSlot.Render>
        {(item) => <ToolbarItem {...item} />}
      </toolbarSlot.Render>
    </header>
  );

  const body = (
    <>
      {toolbar}
      <main className="min-h-0 flex-1 overflow-hidden bg-muted/30">
        {children}
      </main>
    </>
  );

  // No sidebar → no SidebarProvider/Inset; just a full-height column holding
  // the (optional) toolbar and the main renderer.
  if (!sidebarSlot) {
    return <div className="flex h-full min-h-0 flex-col">{body}</div>;
  }

  return (
    <SidebarProvider className="h-full min-h-0">
      <Sidebar>
        {header && (
          <SidebarHeader className="h-12 justify-center border-b px-4 py-0">
            {header}
          </SidebarHeader>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <sidebarSlot.Render>
            {(item) => <item.component />}
          </sidebarSlot.Render>
        </div>
      </Sidebar>

      <SidebarInset className="min-w-0">{body}</SidebarInset>
    </SidebarProvider>
  );
}

import type { ReactNode } from "react";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
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
}: {
  sidebarSlot: RenderSlot<AppShellSidebarItem>;
  toolbarSlot: RenderSlot<AppShellToolbarItem>;
  header?: ReactNode;
}) {
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

      <SidebarInset className="min-w-0">
        <header className="flex items-center border-b px-3 h-12 gap-2 bg-background overflow-hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <toolbarSlot.Render>
            {(item) => <ToolbarItem {...item} />}
          </toolbarSlot.Render>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden bg-muted/30">
          <MillerColumns />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { type ComponentType, type ReactNode } from "react";
import type { ReorderableSlot } from "@plugins/reorder/web";
import { Reorder, isGroupEntry, isSpacer } from "@plugins/reorder/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
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
  icon: ComponentType<{ className?: string }>;
  component: ComponentType;
};

export type AppShellToolbarItem = {
  id: string;
  label?: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  component?: ComponentType;
  group?: string;
  excludeFromReorder?: boolean;
};

function ToolbarItem(item: {
  label?: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  component?: ComponentType;
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
  toolbarSlot: ReorderableSlot<AppShellToolbarItem>;
  header?: ReactNode;
}) {
  const toolbarArea = Reorder.useArea(toolbarSlot);
  const toolbarSlotId = toolbarSlot.id;

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
        <header className="flex items-center border-b px-3 h-12 gap-2 bg-background">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <toolbarArea.DndWrapper>
            {toolbarArea.groupedEntries.map((entry) => {
              if (isGroupEntry(entry)) {
                return (
                  <toolbarArea.GroupBox
                    key={entry.group.id}
                    group={entry.group}
                  >
                    <div className="flex items-center gap-1">
                      {entry.members.map((member) => {
                        if (isSpacer(member)) return null;
                        return (
                          <toolbarArea.ReorderItem
                            key={member.id}
                            item={member}
                          >
                            <PluginErrorBoundary slot={toolbarSlotId}>
                              <ToolbarItem {...member} />
                            </PluginErrorBoundary>
                          </toolbarArea.ReorderItem>
                        );
                      })}
                    </div>
                  </toolbarArea.GroupBox>
                );
              }
              if (isSpacer(entry)) {
                return (
                  <toolbarArea.ReorderItem key={entry.id} item={entry}>
                    {null}
                  </toolbarArea.ReorderItem>
                );
              }
              return (
                <toolbarArea.ReorderItem key={entry.id} item={entry}>
                  <PluginErrorBoundary slot={toolbarSlotId}>
                    <ToolbarItem {...entry} />
                  </PluginErrorBoundary>
                </toolbarArea.ReorderItem>
              );
            })}
          </toolbarArea.DndWrapper>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden bg-muted/30">
          <MillerColumns />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

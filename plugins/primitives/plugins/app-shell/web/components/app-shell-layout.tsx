import { Fragment, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { MdChevronRight } from "react-icons/md";
import type { ReorderableSlot } from "@plugins/reorder/web";
import { Reorder, isGroupEntry, isSpacer } from "@plugins/reorder/web";
import type { TopLevelEntry } from "@plugins/reorder/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export type AppShellSidebarItem = {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  component?: ComponentType;
  group?: string;
  labelExtra?: ComponentType;
  scroll?: boolean;
  excludeFromReorder?: boolean;
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

function PaneSectionLabel({
  pane,
  isCollapsed,
  onToggle,
}: {
  pane: {
    title: string;
    icon: ComponentType<{ className?: string }>;
    labelExtra?: ComponentType;
  };
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <SidebarGroupLabel
      className="group/label cursor-pointer select-none hover:text-sidebar-foreground"
      onClick={onToggle}
    >
      <pane.icon className="size-4 mr-2" />
      {pane.title}
      {pane.labelExtra && <pane.labelExtra />}
      <MdChevronRight
        className={`ml-auto size-4 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
      />
    </SidebarGroupLabel>
  );
}

export function AppShellLayout({
  sidebarSlot,
  toolbarSlot,
  header,
  defaultCollapsed = new Set(),
  sidebarGroupIcons,
}: {
  sidebarSlot: ReorderableSlot<AppShellSidebarItem>;
  toolbarSlot: ReorderableSlot<AppShellToolbarItem>;
  header?: ReactNode;
  defaultCollapsed?: Set<string>;
  sidebarGroupIcons?: Record<string, ComponentType<{ className?: string }>>;
}) {
  const sidebarButtonsArea = Reorder.useArea(sidebarSlot, {
    subId: "buttons",
    filter: (s) => !!s.onClick && !s.component,
  });
  const pinnedPanesArea = Reorder.useArea(sidebarSlot, {
    subId: "pinned-panes",
    filter: (s) => !!s.component && !s.scroll,
    getGroup: () => null,
  });
  const scrollPanesArea = Reorder.useArea(sidebarSlot, {
    subId: "scroll-panes",
    filter: (s) => !!s.component && s.scroll === true,
    getGroup: () => null,
  });
  const buttonGroups = useMemo(() => {
    const map = new Map<string, TopLevelEntry<AppShellSidebarItem>[]>();
    for (const entry of sidebarButtonsArea.groupedEntries) {
      let key: string;
      if (isGroupEntry(entry)) {
        const firstMember = entry.members[0];
        key = firstMember && !isSpacer(firstMember) ? (firstMember.group ?? "") : "";
      } else if (isSpacer(entry)) {
        key = "";
      } else {
        key = entry.group ?? "";
      }
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [sidebarButtonsArea.groupedEntries]);

  const [collapsed, setCollapsed] = useState<Set<string>>(defaultCollapsed);
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toolbarArea = Reorder.useArea(toolbarSlot);
  const visibleScrollPanes = scrollPanesArea.items.filter(
    (p) => !collapsed.has(p.title) && p.component,
  );

  const sidebarSlotId = sidebarSlot.id;
  const toolbarSlotId = toolbarSlot.id;

  return (
    <SidebarProvider className="h-full min-h-0">
      <Sidebar>
        {header && (
          <SidebarHeader className="h-12 justify-center border-b px-4 py-0">
            {header}
          </SidebarHeader>
        )}
        <div className="flex shrink-0 flex-col">
          <sidebarButtonsArea.DndWrapper>
            {Array.from(buttonGroups.entries()).map(([groupName, entries]) => (
              <Fragment key={`btn-group-${groupName}`}>
                <SidebarGroup>
                  {groupName && (() => {
                    const GroupIcon = sidebarGroupIcons?.[groupName];
                    const isCollapsed = collapsed.has(groupName);
                    return (
                      <SidebarGroupLabel
                        className="cursor-pointer select-none hover:text-sidebar-foreground"
                        onClick={() => toggleSection(groupName)}
                      >
                        {GroupIcon && <GroupIcon className="size-4 mr-2" />}
                        {groupName}
                        <MdChevronRight
                          className={`ml-auto size-4 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
                        />
                      </SidebarGroupLabel>
                    );
                  })()}
                  {!collapsed.has(groupName) && (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {entries.map((entry) => {
                          if (isGroupEntry(entry)) {
                            return (
                              <sidebarButtonsArea.GroupBox
                                key={entry.group.id}
                                group={entry.group}
                              >
                                {entry.members.map((member) => {
                                  if (isSpacer(member)) return null;
                                  return (
                                    <sidebarButtonsArea.ReorderItem
                                      key={member.id}
                                      item={member}
                                    >
                                      <PluginErrorBoundary
                                        slot={sidebarSlotId}
                                        label={member.title}
                                      >
                                        <SidebarMenuItem>
                                          <SidebarMenuButton onClick={member.onClick}>
                                            <member.icon className="size-4" />
                                            <span>{member.title}</span>
                                          </SidebarMenuButton>
                                        </SidebarMenuItem>
                                      </PluginErrorBoundary>
                                    </sidebarButtonsArea.ReorderItem>
                                  );
                                })}
                              </sidebarButtonsArea.GroupBox>
                            );
                          }
                          if (isSpacer(entry)) return null;
                          return (
                            <sidebarButtonsArea.ReorderItem
                              key={entry.id}
                              item={entry}
                            >
                              <PluginErrorBoundary
                                slot={sidebarSlotId}
                                label={entry.title}
                              >
                                <SidebarMenuItem>
                                  <SidebarMenuButton onClick={entry.onClick}>
                                    <entry.icon className="size-4" />
                                    <span>{entry.title}</span>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              </PluginErrorBoundary>
                            </sidebarButtonsArea.ReorderItem>
                          );
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>
              </Fragment>
            ))}
          </sidebarButtonsArea.DndWrapper>

          <pinnedPanesArea.DndWrapper>
            {pinnedPanesArea.items.map((pane) => (
              <Fragment key={pane.id}>
                <pinnedPanesArea.ReorderItem item={pane}>
                  <PluginErrorBoundary slot={sidebarSlotId} label={pane.title}>
                    <SidebarGroup>
                      <PaneSectionLabel
                        pane={pane}
                        isCollapsed={collapsed.has(pane.title)}
                        onToggle={() => toggleSection(pane.title)}
                      />
                      {!collapsed.has(pane.title) && pane.component && (
                        <SidebarGroupContent>
                          <pane.component />
                        </SidebarGroupContent>
                      )}
                    </SidebarGroup>
                  </PluginErrorBoundary>
                </pinnedPanesArea.ReorderItem>
              </Fragment>
            ))}
          </pinnedPanesArea.DndWrapper>

          <scrollPanesArea.DndWrapper>
            {scrollPanesArea.items.map((pane) => (
              <Fragment key={pane.id}>
                <scrollPanesArea.ReorderItem item={pane}>
                  <PluginErrorBoundary slot={sidebarSlotId} label={pane.title}>
                    <SidebarGroup className="pb-0">
                      <PaneSectionLabel
                        pane={pane}
                        isCollapsed={collapsed.has(pane.title)}
                        onToggle={() => toggleSection(pane.title)}
                      />
                    </SidebarGroup>
                  </PluginErrorBoundary>
                </scrollPanesArea.ReorderItem>
              </Fragment>
            ))}
          </scrollPanesArea.DndWrapper>
        </div>

        {visibleScrollPanes.length > 0 && (
          <SidebarContent className="pt-0">
            {visibleScrollPanes.map((pane) => {
              const Comp = pane.component!;
              return <Comp key={pane.id} />;
            })}
          </SidebarContent>
        )}
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

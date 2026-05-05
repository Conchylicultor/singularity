import { Fragment, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { MdTune, MdChevronRight } from "react-icons/md";
import { toast } from "sonner";

const SIDEBAR_GROUPS: Record<
  string,
  { icon: ComponentType<{ className?: string }> }
> = {
  System: { icon: MdTune },
};
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { Reorder } from "@plugins/reorder/web";
import { Shell as ShellCommands } from "../commands";
import { Shell } from "../slots";
import { Toaster } from "./toaster";
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

const DEFAULT_COLLAPSED = new Set(["Debug"]);

export function ShellLayout() {
  // The sidebar slot renders three disjoint sub-areas with no shared layout.
  // Each gets its own subId so contribution ids only need to be unique within
  // their sub-area (a "code-explorer" button and a "code-explorer" pane do not
  // collide on rank storage).
  const sidebarButtonsArea = Reorder.useArea(Shell.Sidebar, {
    subId: "buttons",
    filter: (s) => !!s.onClick && !s.component,
  });
  const pinnedPanesArea = Reorder.useArea(Shell.Sidebar, {
    subId: "pinned-panes",
    filter: (s) => !!s.component && !s.scroll,
    getGroup: () => null,
  });
  const scrollPanesArea = Reorder.useArea(Shell.Sidebar, {
    subId: "scroll-panes",
    filter: (s) => !!s.component && s.scroll === true,
    getGroup: () => null,
  });
  const buttonGroups = useMemo(() => {
    const map = new Map<string, typeof sidebarButtonsArea.items>();
    for (const btn of sidebarButtonsArea.items) {
      const key = btn.group ?? "";
      const list = map.get(key) ?? [];
      list.push(btn);
      map.set(key, list);
    }
    return map;
  }, [sidebarButtonsArea.items]);

  const [collapsed, setCollapsed] = useState<Set<string>>(DEFAULT_COLLAPSED);
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toolbarArea = Reorder.useArea(Shell.Toolbar);
  const visibleScrollPanes = scrollPanesArea.items.filter(
    (p) => !collapsed.has(p.title) && p.component,
  );

  ShellCommands.Toast.useHandler(({ title, description, variant }) => {
    const opts = { description: title ? description : undefined };
    const message = title ?? description;
    const fn = variant && variant !== "default" ? toast[variant] : toast;
    fn(message, opts);
  });

  // Unhandled promise rejections are surfaced as toasts; without this they
  // vanish into the devtools console and the UI silently stalls.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason);
      toast.error(message);
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  return (
    <>
      <SidebarProvider className="h-full min-h-0">
        <Sidebar>
          <SidebarHeader className="h-12 justify-center border-b px-4 py-0">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                if (window.location.pathname === "/") return;
                history.pushState({}, "", "/");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img src="/icon.svg" alt="Singularity" className="size-6" />
              <span className="text-base font-semibold tracking-tight">Singularity</span>
            </a>
          </SidebarHeader>
          <div className="flex shrink-0 flex-col">
            <sidebarButtonsArea.DndWrapper>
              {Array.from(buttonGroups.entries()).map(([groupName, btns], gi) => (
                <Fragment key={`btn-group-${groupName}`}>
                  {gi > 0 && <Separator className="mx-2 w-auto bg-sidebar-border" />}
                  <SidebarGroup>
                    {groupName && (() => {
                      const GroupIcon = SIDEBAR_GROUPS[groupName]?.icon;
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
                          {btns.map((btn) => (
                            <sidebarButtonsArea.ReorderItem
                              key={btn.id}
                              item={btn}
                            >
                              <PluginErrorBoundary
                                slot="shell.sidebar"
                                label={btn.title}
                              >
                                <SidebarMenuItem>
                                  <SidebarMenuButton onClick={btn.onClick}>
                                    <btn.icon className="size-4" />
                                    <span>{btn.title}</span>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              </PluginErrorBoundary>
                            </sidebarButtonsArea.ReorderItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    )}
                  </SidebarGroup>
                </Fragment>
              ))}
            </sidebarButtonsArea.DndWrapper>

            <pinnedPanesArea.DndWrapper>
              {pinnedPanesArea.items.map((pane, i) => (
                <Fragment key={pane.id}>
                  {(i > 0 || buttonGroups.size > 0) && (
                    <Separator className="mx-2 w-auto bg-sidebar-border" />
                  )}
                  <pinnedPanesArea.ReorderItem item={pane}>
                    <PluginErrorBoundary slot="shell.sidebar" label={pane.title}>
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
              {scrollPanesArea.items.map((pane, i) => (
                <Fragment key={pane.id}>
                  {(i > 0 || buttonGroups.size > 0 || pinnedPanesArea.items.length > 0) && (
                    <Separator className="mx-2 w-auto bg-sidebar-border" />
                  )}
                  <scrollPanesArea.ReorderItem item={pane}>
                    <PluginErrorBoundary slot="shell.sidebar" label={pane.title}>
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
              {toolbarArea.items.map((item, i) => (
                <Fragment key={item.id}>
                  {i > 0 && item.group !== toolbarArea.items[i - 1]!.group && (
                    <div className="flex-1" />
                  )}
                  <toolbarArea.ReorderItem item={item}>
                    <PluginErrorBoundary slot="shell.toolbar">
                      <ToolbarItem {...item} />
                    </PluginErrorBoundary>
                  </toolbarArea.ReorderItem>
                </Fragment>
              ))}
            </toolbarArea.DndWrapper>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden bg-muted/30">
            <MillerColumns />
          </main>

        </SidebarInset>
      </SidebarProvider>
    <Toaster />
    </>
  );
}

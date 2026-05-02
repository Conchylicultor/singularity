import { Fragment, useEffect, useState } from "react";
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
  const sidebars = Shell.Sidebar.useContributions();
  const pinnedPanes = sidebars.filter((s) => s.component && !s.scroll);
  const scrollPanes = sidebars.filter((s) => s.component && s.scroll);
  const sidebarButtons = sidebars.filter((s) => s.onClick && !s.component);
  const buttonGroups = new Map<string, typeof sidebarButtons>();
  for (const btn of sidebarButtons) {
    const key = btn.group ?? "";
    const list = buttonGroups.get(key) ?? [];
    list.push(btn);
    buttonGroups.set(key, list);
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(DEFAULT_COLLAPSED);
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toolbarItems = Shell.Toolbar.useContributions();
  const visibleScrollPanes = scrollPanes.filter(
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
    <TooltipProvider>
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
                          <PluginErrorBoundary
                            key={btn.title}
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
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>
              </Fragment>
            ))}

            {pinnedPanes.map((pane, i) => (
              <Fragment key={pane.title}>
                {(i > 0 || buttonGroups.size > 0) && (
                  <Separator className="mx-2 w-auto bg-sidebar-border" />
                )}
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
              </Fragment>
            ))}

            {scrollPanes.map((pane, i) => (
              <Fragment key={pane.title}>
                {(i > 0 || buttonGroups.size > 0 || pinnedPanes.length > 0) && (
                  <Separator className="mx-2 w-auto bg-sidebar-border" />
                )}
                <PluginErrorBoundary slot="shell.sidebar" label={pane.title}>
                  <SidebarGroup className="pb-0">
                    <PaneSectionLabel
                      pane={pane}
                      isCollapsed={collapsed.has(pane.title)}
                      onToggle={() => toggleSection(pane.title)}
                    />
                  </SidebarGroup>
                </PluginErrorBoundary>
              </Fragment>
            ))}
          </div>

          {visibleScrollPanes.length > 0 && (
            <SidebarContent className="pt-0">
              {visibleScrollPanes.map((pane) => {
                const Comp = pane.component!;
                return <Comp key={pane.title} />;
              })}
            </SidebarContent>
          )}
        </Sidebar>

        <SidebarInset className="min-w-0">
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

          <main className="min-h-0 flex-1 overflow-hidden bg-muted/30">
            <MillerColumns />
          </main>

        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
    <Toaster />
    </>
  );
}

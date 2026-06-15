import { Button, Sidebar, SidebarHeader, SidebarInset, SidebarProvider, SidebarTrigger } from "@plugins/primitives/plugins/ui-kit/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import type { ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import {
  renderIsolated,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type { SidebarFramingProps } from "../../core";
import { AppShell } from "../slots";
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

/**
 * The current (and default) sidebar framing, extracted verbatim from the
 * sidebar-bearing branch below. Used when no `AppShell.Framing` is contributed,
 * so the shell renders identically even if the sidebar-framing plugin is not
 * loaded. The `flush` variant of sidebar-framing mirrors this byte-for-byte.
 */
function DefaultFlushFraming({
  header,
  sidebarContent,
  body,
}: SidebarFramingProps) {
  return (
    <SidebarProvider className="h-full min-h-0">
      <Sidebar>
        {header && (
          <SidebarHeader className="h-chrome-bar justify-center whitespace-nowrap px-chrome py-none">
            {header}
          </SidebarHeader>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{sidebarContent}</div>
      </Sidebar>

      <SidebarInset className="min-w-0">{body}</SidebarInset>
    </SidebarProvider>
  );
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
    <Bar tier="chrome">
      {sidebarSlot && <SidebarTrigger />}
      <toolbarSlot.Render>
        {(item) => <ToolbarItem {...item} />}
      </toolbarSlot.Render>
    </Bar>
  );

  const body = (
    <>
      {toolbar}
      <main className="min-h-0 flex-1 overflow-hidden bg-muted/30">
        {children}
      </main>
    </>
  );

  // A UI plugin can contribute the sidebar/main framing (flush/floating/inset).
  // Exactly one framing is expected — its Region internally dispatches to the
  // per-app active variant. With none, fall back to the inline default flush.
  const framings = AppShell.Framing.useContributions();

  // No sidebar → no SidebarProvider/Inset; just a full-height column holding
  // the (optional) toolbar and the main renderer. Framing is sidebar-only.
  if (!sidebarSlot) {
    return <div className="flex h-full min-h-0 flex-col">{body}</div>;
  }

  const sidebarContent = (
    <sidebarSlot.Render>{(item) => <item.component />}</sidebarSlot.Render>
  );

  // useContributions() seals the `component` field, so the framing can't be
  // rendered as <Framing/>; route it through renderIsolated (which unseals and
  // applies the error-boundary middleware). No contribution → inline default.
  const framingProps: SidebarFramingProps = { header, sidebarContent, body };
  const framing = framings[0];
  return framing ? (
    renderIsolated(
      AppShell.Framing.id,
      framing as unknown as Contribution,
      framingProps,
    )
  ) : (
    <DefaultFlushFraming {...framingProps} />
  );
}

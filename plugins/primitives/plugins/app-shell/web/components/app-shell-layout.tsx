import { Button, Sidebar, SidebarHeader, SidebarInset, SidebarProvider, SidebarTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { SurfaceChromeContext } from "@plugins/primitives/plugins/pane/web";
import { useContext, type ReactNode } from "react";
import { PluginRuntimeContext, type Contribution } from "@plugins/framework/plugins/web-sdk/core";
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

type ToolbarIcon = React.ComponentType<{ className?: string }>;

/**
 * An action item — a ghost button. Requires an `onClick` *and* at least one of
 * `label`/`icon`, so an action is never an invisible empty button. `component`
 * is forbidden: an item is an action xor a custom widget, never both.
 */
export type AppShellToolbarAction = {
  onClick: () => void;
  component?: never;
  group?: string;
} & (
  | { label: string; icon?: ToolbarIcon }
  | { icon: ToolbarIcon; label?: string }
);

/**
 * A custom-rendered widget. Requires a `component`; the action fields are
 * forbidden so it can't masquerade as a half-specified button.
 */
export type AppShellToolbarComponent = {
  component: React.ComponentType;
  onClick?: never;
  label?: never;
  icon?: never;
  group?: string;
};

/**
 * A single toolbar contribution. The union carries **exactly one** renderable
 * form — an `onClick` action (with a visible label and/or icon) or a
 * `component`. A label-only item with no `onClick`/`component` matches neither
 * member and is unconstructable, so the silent "renders nothing" footgun is
 * impossible by type. {@link ToolbarItem} additionally throws on a forced
 * malformed item rather than rendering null.
 */
export type AppShellToolbarItem = AppShellToolbarAction | AppShellToolbarComponent;

function ToolbarItem(item: AppShellToolbarItem) {
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
  // Unreachable by construction — the AppShellToolbarItem union admits no item
  // with neither `component` nor `onClick`. Fail loudly if one is forced in via
  // an untyped / `as any` contribution, instead of silently rendering nothing.
  throw new Error(
    "AppShellToolbarItem has neither `component` nor `onClick`: a toolbar " +
      "contribution must carry exactly one renderable form (an `onClick` " +
      "action with a label and/or icon, or a `component`).",
  );
}

/**
 * Whether a (possibly absent) render slot has at least one contribution.
 *
 * Reads the plugin runtime directly (the same `bySlot` map `.Render` paints
 * from) rather than the slot's own `useContributions()` hook, so it can be
 * called unconditionally: `slot` may be `undefined`, and a hook can't be
 * called conditionally. This is what lets the chrome toolbar bar be driven by
 * *real* contributions instead of merely whether a slot object was passed —
 * an app that wires a toolbar slot with zero contributors gets no empty bar.
 */
function useSlotHasContributions(slot: { id: string } | undefined): boolean {
  const ctx = useContext(PluginRuntimeContext);
  return !!slot && (ctx?.bySlot.get(slot.id)?.length ?? 0) > 0;
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
          // eslint-disable-next-line layout/no-adhoc-layout -- justify-center vertically centers the header inside shadcn SidebarHeader's own flex column; not a primitive boundary
          <SidebarHeader className="h-chrome-bar justify-center whitespace-nowrap px-chrome py-none">
            {header}
          </SidebarHeader>
        )}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of shadcn Sidebar's not-yet-drained flex column (claims the height left below the header) */}
        <Stack gap="none" className="min-h-0 flex-1">{sidebarContent}</Stack>
      </Sidebar>

      {/* eslint-disable-next-line layout/no-adhoc-layout -- min-w-0 on shadcn SidebarInset lets the main area truncate within the not-yet-drained SidebarProvider flex row */}
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
   * toolbar. The chrome toolbar bar renders only when this slot has at least
   * one contribution, so wiring an as-yet-unused slot (a future extension
   * point) costs nothing: no empty bar, and the content's pane header keeps
   * the surface-edge chrome (sidebar toggle) until something contributes.
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
  // Drive the chrome toolbar bar off real contributions, not merely whether a
  // slot object was passed. An app may wire a toolbar slot purely as a future
  // extension point; with zero contributors it must render no bar (otherwise an
  // empty chrome strip strands the sidebar toggle above the content's own pane
  // header). The slot stays a no-op until something contributes to it.
  const hasToolbar = useSlotHasContributions(toolbarSlot);

  const toolbar = hasToolbar && toolbarSlot && (
    <Bar tier="chrome">
      {sidebarSlot && <SidebarTrigger />}
      <toolbarSlot.Render>
        {(item) => <ToolbarItem {...item} />}
      </toolbarSlot.Render>
    </Bar>
  );

  // Hand the content region's top-most pane header the surface-edge chrome.
  // When there's no `chrome`-tier toolbar above it, the columns own the surface
  // top: the first column header hosts the sidebar toggle and the last reserves
  // the floating-action-bar safe area. With a toolbar, the toolbar owns both.
  const body = (
    <>
      {toolbar}
      <Clip as="main" fill className="bg-muted/30">
        <SurfaceChromeContext.Provider
          value={{
            contentOwnsTopChrome: !hasToolbar,
            leadingControl: sidebarSlot ? <SidebarTrigger /> : undefined,
          }}
        >
          {children}
        </SurfaceChromeContext.Provider>
      </Clip>
    </>
  );

  // A UI plugin can contribute the sidebar/main framing (flush/floating/inset).
  // Exactly one framing is expected — its Region internally dispatches to the
  // per-app active variant. With none, fall back to the inline default flush.
  const framings = AppShell.Framing.useContributions();

  // No sidebar → no SidebarProvider/Inset; just a full-height column holding
  // the (optional) toolbar and the main renderer. Framing is sidebar-only.
  if (!sidebarSlot) {
    return <Stack gap="none" className="h-full min-h-0">{body}</Stack>;
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

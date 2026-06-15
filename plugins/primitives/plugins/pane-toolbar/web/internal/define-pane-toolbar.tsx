import { Button, cn, type ControlSize } from "@plugins/primitives/plugins/ui-kit/web";
import type { ComponentType, ReactNode } from "react";
import {
  defineRenderSlot,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";

/**
 * One toolbar entry. Mirrors `AppShellToolbarItem`: either a self-contained
 * zero-prop `component` (reads its own data from app context), or a
 * `label`/`icon`/`onClick` triple rendered as a ghost button. A toolbar item is
 * a contribution, never hand-written JSX — that is the whole point of the host.
 */
export type PaneToolbarItem = {
  label?: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  component?: ComponentType;
};

export interface PaneToolbar {
  /** Leading zone (left): nav, title, selectors. Reorderable. */
  Start: RenderSlot<PaneToolbarItem>;
  /** Trailing zone (right, `ml-auto`): actions/transport. Reorderable. */
  End: RenderSlot<PaneToolbarItem>;
  /** The one sanctioned toolbar `<header>` — renders both zones. */
  Host: ComponentType<{ className?: string }>;
}

export interface PaneToolbarOptions {
  /**
   * Make the toolbar size-owning: every contributed control inherits this
   * density (see `RenderSlotConfig.controlSize`). Omit to let each contribution
   * keep its own size.
   */
  controlSize?: ControlSize;
}

function ToolbarItem(item: PaneToolbarItem): ReactNode {
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
 * The sanctioned home for a full-surface (`chrome: false`) pane's top toolbar.
 *
 * Hand-rolling a `border-b` header bar inside a pane is banned
 * (`no-adhoc-pane-toolbar` lint rule) — route the toolbar through this factory
 * instead. It owns the single toolbar `<header>` chrome (copied verbatim from
 * `AppShellLayout`) and exposes two **reorderable** render-slot zones, so every
 * bar item is a contribution (extensible, error-isolated, drag-to-reorder) and
 * no agent re-derives the chrome.
 *
 * Each app calls this once at module scope (so the slots register at import,
 * which is what lets the build pick them up as reorderable):
 *
 *   const Toolbar = definePaneToolbar("myapp.toolbar");
 *   // contribute: Toolbar.Start({ id: "back", component: BackButton })
 *   // render:     <Toolbar.Host /> at the top of the pane surface
 */
export function definePaneToolbar(
  idBase: string,
  options?: PaneToolbarOptions,
): PaneToolbar {
  const config = {
    controlSize: options?.controlSize,
    docLabel: (p: PaneToolbarItem & { id: string }) => p.label ?? p.id,
  };
  const Start = defineRenderSlot<PaneToolbarItem>(`${idBase}.start`, config);
  const End = defineRenderSlot<PaneToolbarItem>(`${idBase}.end`, config);

  function Host({ className }: { className?: string }): ReactNode {
    return (
      <header
        className={cn(
          "flex items-center whitespace-nowrap border-b pl-chrome pr-floating-bar h-chrome-bar gap-sm bg-background overflow-hidden",
          className,
        )}
      >
        <Start.Render>{(item) => <ToolbarItem {...item} />}</Start.Render>
        <div className="ml-auto flex items-center gap-sm">
          <End.Render>{(item) => <ToolbarItem {...item} />}</End.Render>
        </div>
      </header>
    );
  }

  return { Start, End, Host };
}

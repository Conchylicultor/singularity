import { Button, type ControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentType, ReactNode } from "react";

/**
 * One pane-header entry. Either a self-contained zero-prop `component` (reads
 * its own data from app context), or a `label`/`icon`/`onClick` triple rendered
 * as a ghost button. A header item is a contribution, never hand-written JSX.
 *
 * This type lives in `pane` (not `pane-toolbar`) because `PaneChrome` is the
 * host that renders it — `pane-toolbar` imports it back from here. Defining it
 * in `pane-toolbar` and having `pane` import it would form a DAG cycle
 * (`pane-toolbar` already depends on `pane`).
 */
export type PaneToolbarItem = {
  label?: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  component?: ComponentType;
};

/**
 * Renders one `PaneToolbarItem`: a self-contained `component`, or a ghost button
 * built from `label`/`icon`/`onClick`. Shared by `PaneChrome` (custom-header
 * branch) and `definePaneToolbar`'s zone renderers.
 */
export function ToolbarItem(item: PaneToolbarItem): ReactNode {
  if (item.component) {
    const Comp = item.component;
    return <Comp />;
  }
  if (item.onClick) {
    return (
      <Button variant="ghost" onClick={item.onClick}>
        {item.icon && <item.icon className="size-4" />}
        {item.label}
      </Button>
    );
  }
  return null;
}

/**
 * The item shape a header zone's `.Render` children callback receives — a
 * `PaneToolbarItem` plus the slot-injected `id` (and the reorder-middleware
 * flags). Mirrors `RenderSlot<PaneToolbarItem>`'s `.Render` prop exactly, so the
 * duck-typed `PaneHeaderZones` below is structurally assignable from a real
 * `definePaneToolbar` return (the `Partial<defaultProps>` check is invariant on
 * this callback param — a narrower `PaneToolbarItem` here would reject it).
 */
type PaneHeaderRenderItem = PaneToolbarItem & {
  id: string;
  excludeFromReorder?: boolean;
  reorderFill?: boolean;
};

/**
 * Structural shape of a pane's custom header — the reorderable `Start`/`End`
 * render-slot zones a pane opts into via `chrome.header`. Duck-typed on the
 * slot's `.Render` (matching `RenderSlot.Render`'s prop signature) so `pane`
 * needs NO import from `pane-toolbar` (which would cycle). `definePaneToolbar`'s
 * return value structurally satisfies this.
 */
export interface PaneHeaderZones {
  /** Leading zone (left): nav, title, selectors. */
  Start: {
    Render: ComponentType<{ children?: (item: PaneHeaderRenderItem) => ReactNode }>;
  };
  /** Trailing zone (right, `ml-auto`): actions/transport. */
  End: {
    Render: ComponentType<{ children?: (item: PaneHeaderRenderItem) => ReactNode }>;
  };
  /** Optional override for the zone control density (innermost wins). */
  controlSize?: ControlSize;
}

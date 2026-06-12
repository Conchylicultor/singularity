import { useLayoutEffect } from "react";
import { MdAutoAwesome } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useConfig } from "@plugins/config_v2/web";
import { useActiveApp } from "@plugins/apps/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { FLOATING_BAR_GUTTER, floatingBarConfig } from "../../shared/config";
import {
  useFloatingBarStatus,
  type StatusTone,
} from "../internal/use-floating-bar-status";

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/**
 * Global CSS var carrying the bar's reserved top-right gutter. The `app.css`
 * `pr-floating-bar` utility reads it; it exists on `:root` **iff** the bar is
 * mounted, so headers reclaim the space whenever the bar is hidden.
 */
const SAFE_AREA_VAR = "--floating-bar-safe-area";

/**
 * Global floating action bar (top-right). Collapsed: a single icon with a
 * status dot aggregating attention signals. On hover: morphs open into the
 * shared `ActionBar.Item` button row — the same actions as the main toolbar
 * (including the health dot), available from any app.
 */
export function FloatingBar() {
  const { enabled } = useConfig(floatingBarConfig);
  const activeApp = useActiveApp();
  const status = useFloatingBarStatus();

  // Hidden when disabled, or on the app that already hosts the toolbar (the
  // agent manager) — avoids double-mounting the action buttons.
  const visible = enabled && !activeApp?.hostsToolbar;

  // Publish (or clear) the reserved-gutter var before paint, so headers that
  // route through `pr-floating-bar` reserve space without a reserve-then-jump
  // flash. The bar owns this value: it lives on `:root` only while mounted.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (visible) root.style.setProperty(SAFE_AREA_VAR, FLOATING_BAR_GUTTER);
    else root.style.removeProperty(SAFE_AREA_VAR);
    return () => {
      root.style.removeProperty(SAFE_AREA_VAR);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <FloatingAction
      className="fixed top-2 right-3 z-popover"
      anchor="top-right"
      variant="ghost"
      panelClassName="items-center"
    >
      <WithTooltip content={status.pending ? "Loading…" : status.tooltip}>
        <div className="pointer-events-auto relative flex size-8 shrink-0 items-center justify-center">
          <MdAutoAwesome className="size-4 text-muted-foreground" />
          <StatusDot
            colorClass={`${TONE_CLASS[status.pending ? "ok" : status.tone]}${!status.pending && status.pulse ? " animate-pulse" : ""}`}
            size="sm"
            className="absolute -top-0.5 -right-0.5 ring-2 ring-background"
          />
        </div>
      </WithTooltip>

      <FloatingActionFadeIn className="flex max-w-0 items-center gap-sm overflow-hidden whitespace-nowrap pr-sm transition-[max-width] duration-200 group-data-hovered/fa:max-w-[40rem]">
        <ActionBar.Item.Render />
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}

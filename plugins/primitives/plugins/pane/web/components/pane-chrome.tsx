import { useContext, type ReactNode } from "react";
import {
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdOpenInFull,
} from "react-icons/md";
import { PluginErrorBoundary } from "@core";
import { Button } from "@/components/ui/button";
import { PaneMatchContext, type PaneObject } from "../pane";

interface PaneChromeProps {
  pane: PaneObject<any, any>;
  /**
   * Header title. When omitted, falls back to the pane's `chrome.title`
   * config (string or `(params) => string`). Pass a node when the title
   * needs loaded data (e.g. a task name) or custom layout.
   */
  title?: ReactNode;
  /**
   * Per-instance right-side actions, rendered after slot-based
   * `position="right"` Actions contributions and before expand/close. Use
   * for stateful, host-coupled controls (e.g. file-pane tabs) that don't
   * fit the contribution model.
   */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Standard pane header: ‹ › history buttons, title, optional
 * `position="left"` actions, optional `position="right"` actions, an optional
 * expand button, and a × close button on the far right. The close button is
 * shown by default for panes with a parent (opt out via
 * `chrome: { close: false }`). Pane authors who want a fully custom header
 * layout can opt out (`chrome: false` in `Pane.define`) and compose the
 * pieces (`<PaneHistoryButtons/>`, `<PaneActionsSlot/>`) themselves.
 */
export function PaneChrome({ pane, title, actions, children }: PaneChromeProps) {
  const chrome = pane._internal.chrome;
  const fallbackTitle = useChromeTitle(pane);
  if (!chrome.enabled) return <>{children}</>;
  const resolvedTitle = title ?? fallbackTitle;
  const showClose = chrome.close && pane._internal.parent != null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-2 border-b px-2">
        {chrome.history && <PaneHistoryButtons pane={pane} />}
        {resolvedTitle != null && resolvedTitle !== "" && (
          <span className="truncate text-sm font-medium">{resolvedTitle}</span>
        )}
        <PaneActionsSlot pane={pane} position="left" />
        <div className="flex-1" />
        <PaneActionsSlot pane={pane} position="right" />
        {actions}
        {chrome.expand && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => pane.expand()}
            aria-label="Expand"
          >
            <MdOpenInFull className="size-4" />
          </Button>
        )}
        {showClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => pane.close()}
            aria-label="Close"
          >
            <MdClose className="size-4" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function useChromeTitle(pane: PaneObject<any, any>): ReactNode {
  const chrome = pane._internal.chrome;
  const match = useContext(PaneMatchContext);
  if (chrome.title === undefined) return null;
  if (typeof chrome.title === "string") return chrome.title;
  const entry = match?.chain.find((e) => e.pane === pane._internal);
  if (!entry) return null;
  return chrome.title(entry.fullParams);
}

export function PaneHistoryButtons({ pane }: { pane: PaneObject<any, any> }) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => pane.back()}
        aria-label="Back"
      >
        <MdChevronLeft className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => pane.forward()}
        aria-label="Forward"
      >
        <MdChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export function PaneActionsSlot({
  pane,
  position = "right",
}: {
  pane: PaneObject<any, any>;
  position?: "left" | "right";
}) {
  const actions = pane.Actions.useContributions().filter(
    (a) => (a.position ?? "right") === position,
  );
  if (actions.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {actions.map((a, i) => (
        <PluginErrorBoundary key={i} slot={pane.Actions.id}>
          <a.component />
        </PluginErrorBoundary>
      ))}
    </div>
  );
}

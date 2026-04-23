import type { ReactNode } from "react";
import { MdChevronLeft, MdChevronRight, MdOpenInFull } from "react-icons/md";
import { PluginErrorBoundary } from "@core";
import { Button } from "@/components/ui/button";
import type { PaneObject } from "../pane";

interface PaneChromeProps {
  pane: PaneObject<any, any>;
  title?: string;
  children: ReactNode;
}

/**
 * Standard pane header: ‹ › history buttons, optional title, actions slot,
 * and optional expand button. Pane authors who want a custom header layout
 * can opt out (`chrome: false` in `Pane.define`) and compose the pieces
 * (`<PaneHistoryButtons/>`, `<PaneActionsSlot/>`) themselves.
 */
export function PaneChrome({ pane, title, children }: PaneChromeProps) {
  const chrome = pane._internal.chrome;
  if (!chrome.enabled) return <>{children}</>;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-2 border-b px-2">
        {chrome.history && <PaneHistoryButtons pane={pane} />}
        {title && (
          <span className="truncate text-sm font-medium">{title}</span>
        )}
        <div className="flex-1" />
        <PaneActionsSlot pane={pane} />
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
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
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

export function PaneActionsSlot({ pane }: { pane: PaneObject<any, any> }) {
  const actions = pane.Actions.useContributions();
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

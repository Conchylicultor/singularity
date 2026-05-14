import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdMoreHoriz,
  MdOpenInFull,
} from "react-icons/md";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PaneMatchContext, type PaneMatch, type PaneObject } from "../pane";
import { PaneLayoutContext } from "../maximize-context";

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
  /**
   * When true, suppresses the right-side `OverflowActionsBar` (slot-based
   * `position="right"` contributions). A flex-1 spacer is still rendered so
   * expand/close stay pinned to the far right. Use when the host renders
   * right-side actions elsewhere (e.g. inside the content area).
   */
  hideRightActions?: boolean;
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
export function PaneChrome({ pane, title, actions, hideRightActions, children }: PaneChromeProps) {
  const chrome = pane._internal.chrome;
  const match = useContext(PaneMatchContext);
  const fallbackTitle = chromeTitle(pane, match);
  const layoutCtx = useContext(PaneLayoutContext);
  const doClose = pane.useClose();
  const doPromote = pane.usePromote();
  if (!chrome.enabled) return <>{children}</>;
  const resolvedTitle = title ?? fallbackTitle;
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex h-10 items-center gap-2 border-b px-2"
        onDoubleClick={layoutCtx?.onDoubleClickHeader}
      >
        {chrome.history && <PaneHistoryButtons pane={pane} />}
        {resolvedTitle != null && resolvedTitle !== "" && (
          <span className="truncate text-sm font-medium">{resolvedTitle}</span>
        )}
        <PaneActionsSlot pane={pane} position="left" />
        {hideRightActions ? (
          <div className="flex-1" />
        ) : (
          <OverflowActionsBar pane={pane} extraActions={actions} />
        )}
        {chrome.promote && doPromote && (
          <Button
            variant="ghost"
            size="sm"
            onClick={doPromote}
            aria-label="Promote"
          >
            <MdOpenInFull className="size-4" />
          </Button>
        )}
        {chrome.close && doClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={doClose}
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

function chromeTitle(pane: PaneObject<any, any>, match: PaneMatch | null): ReactNode {
  const chrome = pane._internal.chrome;
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

const MORE_BTN_W = 32; // size-icon button (w-8)
const GAP = 4; // gap-1 = 4px

/**
 * Right-side action bar with overflow detection. Fills available space (flex-1)
 * between left content and the fixed expand/close buttons. When contributions
 * don't all fit, the rightmost ones collapse behind a "⋯" popover.
 */
function OverflowActionsBar({
  pane,
  extraActions,
}: {
  pane: PaneObject<any, any>;
  extraActions?: ReactNode;
}) {
  const slotActions = pane.Actions.useContributions().filter(
    (a) => (a.position ?? "right") === "right",
  );
  const hasExtra = extraActions != null;
  const totalCount = slotActions.length + (hasExtra ? 1 : 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // Start fully expanded; useLayoutEffect corrects before first paint.
  const [visibleCount, setVisibleCount] = useState(totalCount);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const available = container.offsetWidth;
      const items = Array.from(measure.children) as HTMLElement[];

      if (items.length === 0) {
        setVisibleCount(0);
        return;
      }

      // Check if everything fits without a "more" button.
      const totalW = items.reduce(
        (acc, el, i) => acc + el.offsetWidth + (i > 0 ? GAP : 0),
        0,
      );
      if (totalW <= available) {
        setVisibleCount(items.length);
        return;
      }

      // Find the largest prefix that fits with the "more" button.
      let used = 0;
      let count = 0;
      for (const [i, item] of items.entries()) {
        const w = item.offsetWidth;
        const gapBefore = i > 0 ? GAP : 0;
        const cumulative = used + gapBefore + w;
        if (cumulative + GAP + MORE_BTN_W <= available) {
          used = cumulative;
          count = i + 1;
        } else {
          break;
        }
      }
      setVisibleCount(count);
    };

    // Defer observer-triggered recomputes to the next animation frame so that
    // the setState call doesn't land during the layout phase — which would
    // mutate the toolbar DOM, change the container width, and immediately
    // re-fire the observer (the ResizeObserver loop Chrome warns about).
    // The direct recompute() call below stays synchronous for the no-flash
    // initial measurement inside useLayoutEffect.
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recompute);
    });
    ro.observe(container);
    recompute();
    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [totalCount]);

  const visibleSlot = slotActions.slice(0, Math.min(visibleCount, slotActions.length));
  const overflowSlot = slotActions.slice(Math.min(visibleCount, slotActions.length));
  const extraVisible = hasExtra && visibleCount > slotActions.length;
  const extraOverflow = hasExtra && !extraVisible;
  const hasOverflow = overflowSlot.length > 0 || extraOverflow;

  return (
    <>
      {/* Off-screen measurement layer — renders all items to obtain their natural widths. */}
      {totalCount > 0 &&
        createPortal(
          <div
            ref={measureRef}
            style={{
              position: "fixed",
              top: -9999,
              left: -9999,
              display: "flex",
              gap: GAP,
              opacity: 0,
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            {slotActions.map((a, i) => (
              <a.component key={i} />
            ))}
            {hasExtra && <div>{extraActions}</div>}
          </div>,
          document.body,
        )}

      {/* Container takes all remaining space; items are right-aligned. */}
      <div
        ref={containerRef}
        className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden"
      >
        {visibleSlot.map((a, i) => (
          <PluginErrorBoundary key={i} slot={pane.Actions.id}>
            <a.component />
          </PluginErrorBoundary>
        ))}
        {extraVisible && extraActions}

        {hasOverflow && (
          <Popover>
            <PopoverTrigger
              className="inline-flex size-8 items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground"
              aria-label="More actions"
            >
              <MdMoreHoriz className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="w-auto min-w-0 p-1"
            >
              <div className="flex flex-col">
                {overflowSlot.map((a, i) => (
                  <PluginErrorBoundary
                    key={visibleSlot.length + i}
                    slot={pane.Actions.id}
                  >
                    <a.component />
                  </PluginErrorBoundary>
                ))}
                {extraOverflow && extraActions}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </>
  );
}

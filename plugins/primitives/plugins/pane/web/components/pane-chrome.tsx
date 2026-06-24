import { Button, Popover, PopoverContent, PopoverTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Fragment, useContext, useRef, useState, type ReactNode } from "react";
import { useResizeObserver } from "@plugins/primitives/plugins/element-size/web";
import { createPortal } from "react-dom";
import { MdClose, MdMoreHoriz, MdOpenInFull } from "react-icons/md";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { PaneScroll } from "./pane-scroll";
import { ToolbarItem, type PaneHeaderZones } from "./pane-header-item";
import { PaneMatchContext, type PaneMatch, type PaneObject } from "../pane";
import { PaneLayoutContext } from "../maximize-context";
import { SurfaceChromeContext } from "../surface-chrome-context";

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
  /**
   * When true, the header band uses `overflow-visible` instead of the default
   * `overflow-hidden`, letting a title-area child (e.g. `CollapsibleWrap`)
   * spill its expanded rows DOWN over the content below without being clipped
   * by the fixed-height band. Opt in only for panes whose header can reveal
   * overflow; the band stays `h-10` so row 1 and the rest of the chrome are
   * unaffected. Default false (clip — today's behavior for every other pane).
   */
  headerSpill?: boolean;
  children: ReactNode;
}

/**
 * Standard pane header: title, optional `position="left"` actions, optional
 * `position="right"` actions, an optional expand button, and a × close button
 * on the far right. The close button is shown by default for panes with a
 * parent (opt out via `chrome: { close: false }`). A pane that wants a rich
 * custom header (transport / view-switcher / volume) opts into
 * `chrome: { header }` (a `definePaneToolbar` Start/End zone pair); PaneChrome
 * then renders those zones in this same bar instead of the title/Actions, with
 * NO overflow-collapse. The body wrapper and single scroll are unchanged either
 * way.
 */
export function PaneChrome({ pane, title, actions, hideRightActions, headerSpill, children }: PaneChromeProps) {
  const chrome = pane._internal.chrome;
  const match = useContext(PaneMatchContext);
  const fallbackTitle = chromeTitle(pane, match);
  const layoutCtx = useContext(PaneLayoutContext);
  const { contentOwnsTopChrome, leadingControl } = useContext(SurfaceChromeContext);
  const doClose = pane.useClose();
  const doPromote = pane.usePromote();
  const resolvedTitle = title ?? fallbackTitle;
  // Surface-edge chrome: only when this pane header IS the surface's top chrome.
  // The first top-row header hosts the leading control (sidebar toggle); the
  // last reserves the floating-action-bar safe area on its right.
  const showLeading = contentOwnsTopChrome && layoutCtx?.atSurfaceStart && leadingControl != null;
  const reserveEnd = contentOwnsTopChrome && layoutCtx?.atSurfaceEnd;
  return (
    <Column
      className="h-full"
      header={
        <Bar
          tier="pane"
          overflow={headerSpill ? "visible" : "hidden"}
          endSafeArea={reserveEnd}
          className={layoutCtx?.dragHandleProps ? "cursor-grab active:cursor-grabbing" : undefined}
          onDoubleClick={layoutCtx?.onDoubleClickHeader}
          {...layoutCtx?.dragHandleProps}
        >
          {showLeading && leadingControl}
          {chrome.header ? (
            <CustomHeader header={chrome.header} />
          ) : (
            <>
              {resolvedTitle != null &&
                resolvedTitle !== "" &&
                (typeof resolvedTitle === "string" ? (
                  // eslint-disable-next-line layout/no-adhoc-layout -- string pane title: min-w-0 truncate leaf inside Bar's flex row so a long title ellipsizes rather than crushing siblings
                  <Text as="span" variant="label" className="min-w-0 truncate">
                    {resolvedTitle}
                  </Text>
                ) : (
                  // Node titles get the SAME `label` typography baseline as string
                  // titles, so a title node inherits the canonical pane-title size
                  // instead of drifting to the ambient body size. The size is
                  // enforced by the container (CSS inheritance), so title nodes need
                  // not — and should not — set their own size; per-segment weight/
                  // color (e.g. breadcrumb) still applies on top.
                  // eslint-disable-next-line layout/no-adhoc-layout -- node title needs inline-flex baseline alignment for breadcrumb-style multi-segment compositions
                  <Text as="div" variant="label" className="flex min-w-0 items-center">
                    {resolvedTitle}
                  </Text>
                ))}
              <PaneActionsSlot pane={pane} position="left" />
              {hideRightActions ? (
                // eslint-disable-next-line layout/no-adhoc-layout -- explicit flex-grow spacer to push expand/close buttons to far right inside Bar's flex row
                <div className="flex-1" />
              ) : (
                <OverflowActionsBar pane={pane} extraActions={actions} />
              )}
            </>
          )}
          {chrome.promote && doPromote && (
            <Button
              variant="ghost"
              onClick={doPromote}
              aria-label="Promote"
            >
              <MdOpenInFull className="size-4" />
            </Button>
          )}
          {chrome.close && doClose && (
            <Button
              variant="ghost"
              onClick={doClose}
              aria-label="Close"
            >
              <MdClose className="size-4" />
            </Button>
          )}
        </Bar>
      }
      // The pane body owns exactly one scroll, expressed via the shared
      // `PaneScroll` scaffold (`<Scroll axis="y" fill h-full>`) instead of
      // Column's managed `Scroll` body — identical scrolling, one sanctioned
      // idiom. `scrollBody={false}` so Column doesn't add a second scroll.
      scrollBody={false}
      body={
        <PaneScroll>
          <ContentScope>{children}</ContentScope>
        </PaneScroll>
      }
    />
  );
}

/**
 * Custom-header content: the pane's reorderable `Start`/`End` zones rendered
 * inside the standard `<Bar tier="pane">` (same `ml-auto` End-cluster layout the
 * retired `definePaneToolbar.Host` used). NO overflow-collapse — rich End
 * widgets (transport / volume / jog-wheel) never fold behind a "⋯" popover.
 * `promote`/`close` still render after this in `PaneChrome`.
 */
function CustomHeader({ header }: { header: PaneHeaderZones }) {
  const { Start, End } = header;
  return (
    <>
      <Start.Render>{(item) => <ToolbarItem {...item} />}</Start.Render>
      <Stack direction="row" align="center" gap="sm" className="ml-auto">
        <End.Render>{(item) => <ToolbarItem {...item} />}</End.Render>
      </Stack>
    </>
  );
}

function chromeTitle(pane: PaneObject<any, any>, match: PaneMatch | null): ReactNode {
  const chrome = pane._internal.chrome;
  if (chrome.title === undefined) return null;
  if (typeof chrome.title === "string") return chrome.title;
  const entry = match?.panes.find((e) => e.pane === pane._internal);
  if (!entry) return null;
  return chrome.title(entry.fullParams);
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
    // eslint-disable-next-line layout/no-adhoc-layout -- horizontal chip row of action contributions inside Bar; Frame needs named slots but this is a dynamic list
    <div className="flex items-center gap-xs">
      {actions.map((a, i) => (
        <Fragment key={i}>
          {renderIsolated(pane.Actions.id, a as unknown as Contribution)}
        </Fragment>
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
  // Start fully expanded; the synchronous initial measure corrects before first paint.
  const [visibleCount, setVisibleCount] = useState(totalCount);

  // The primitive runs this synchronously on mount (no-flash initial measure)
  // and RAF-debounced on every container resize — so the setState never lands
  // during the layout phase mutating the toolbar DOM and re-firing the observer
  // (the ResizeObserver loop Chrome warns about).
  useResizeObserver(
    containerRef,
    () => {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;

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
    },
    { deps: [totalCount] },
  );

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
              <Fragment key={i}>
                {renderIsolated(pane.Actions.id, a as unknown as Contribution)}
              </Fragment>
            ))}
            {hasExtra && <div>{extraActions}</div>}
          </div>,
          document.body,
        )}

      {/* Container takes all remaining space; items are right-aligned. */}
      <div
        ref={containerRef}
        // flex-1 measurement container for overflow detection; Row/Frame can't model a right-aligned flex-1 measurement region
        // eslint-disable-next-line layout/no-adhoc-layout
        className="flex min-w-0 flex-1 items-center justify-end gap-xs overflow-hidden whitespace-nowrap"
      >
        {visibleSlot.map((a, i) => (
          <Fragment key={i}>
            {renderIsolated(pane.Actions.id, a as unknown as Contribution)}
          </Fragment>
        ))}
        {extraVisible && extraActions}

        {hasOverflow && (
          <Popover>
            <PopoverTrigger
              // eslint-disable-next-line layout/no-adhoc-layout -- icon-button trigger: inline-flex centering glyph; a self-contained control, not a layout region
              className="inline-flex size-8 items-center justify-center rounded-md text-body hover:bg-accent hover:text-accent-foreground"
              aria-label="More actions"
            >
              <MdMoreHoriz className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              width="content"
              padding="xs"
              // eslint-disable-next-line layout/no-adhoc-layout -- min-w-0 lets the popover shrink to its content width; sizing concern on the popover surface, not a layout region
              className="min-w-0"
            >
              {/* eslint-disable-next-line layout/no-adhoc-layout -- flex column of overflow action items inside Popover; Column needs named slots but this is a flat list */}
              <div className="flex flex-col">
                {overflowSlot.map((a, i) => (
                  <Fragment key={visibleSlot.length + i}>
                    {renderIsolated(pane.Actions.id, a as unknown as Contribution)}
                  </Fragment>
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

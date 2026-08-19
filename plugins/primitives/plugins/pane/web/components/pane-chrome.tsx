import { linkGestureProps } from "@plugins/primitives/plugins/link-gesture/web";
import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { useContext, type ReactNode } from "react";
import { AdaptiveBar } from "@plugins/primitives/plugins/adaptive-bar/web";
import { MdClose, MdOpenInFull } from "react-icons/md";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { PaneScroll } from "./pane-scroll";
import { PaneIconAction } from "./pane-icon-action";
import { ToolbarItem, type PaneHeaderZones } from "./pane-header-item";
import { usePaneMatch, type PaneMatch, type AnyPane } from "../pane";
import { PaneLayoutContext } from "../maximize-context";
import { SurfaceChromeContext } from "../surface-chrome-context";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";

interface PaneChromeProps {
  pane: AnyPane;
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
   * When true, suppresses the right-side action bar (slot-based
   * `position="right"` contributions). A `Fill` is still rendered so
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
   *
   * This opens BOTH clip boundaries PaneChrome owns between the band and the
   * title node: the `Bar`'s overflow AND the node-title `<Text>` wrapper (which
   * would otherwise auto-apply the single-line `truncate` recipe — i.e.
   * `overflow:hidden` — because it sits in the Bar's single-line context, and
   * re-clip the very spill this flag enables). The node then owns its own
   * overflow; single-line leaves inside it still truncate via their own class.
   */
  headerSpill?: boolean;
  /**
   * The pane's non-scrolling overlay layer — widgets that float over the BODY
   * (an outline rail) rather than scroll with it. Rendered as a SIBLING of the
   * single `PaneScroll`, inside a `relative isolate` host: an absolutely
   * positioned child of a scroller scrolls away with the document, and a host
   * wrapped around `PaneChrome` instead spans the header — so a corner-pinned
   * overlay lands on the header's own actions.
   *
   * The wrapper exists only when this is passed; omit it and the body is the
   * same tree it always was.
   */
  overlay?: ReactNode;
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
export function PaneChrome({
  pane,
  title,
  actions,
  hideRightActions,
  headerSpill,
  overlay,
  children,
}: PaneChromeProps) {
  const chrome = pane._internal.chrome;
  const match = usePaneMatch();
  const fallbackTitle = chromeTitle(pane, match);
  const layoutCtx = useContext(PaneLayoutContext);
  const { contentOwnsTopChrome, leadingControl } =
    useContext(SurfaceChromeContext);
  const doClose = pane.useClose();
  const promote = pane.usePromote();
  const resolvedTitle = title ?? fallbackTitle;
  // Surface-edge chrome: only when this pane header IS the surface's top chrome.
  // The first top-row header hosts the leading control (sidebar toggle); the
  // last reserves the floating-action-bar safe area on its right.
  const showLeading =
    contentOwnsTopChrome && layoutCtx?.atSurfaceStart && leadingControl != null;
  const reserveEnd = contentOwnsTopChrome && layoutCtx?.atSurfaceEnd;
  return (
    <Column
      className="h-full"
      header={
        <Bar
          tier="pane"
          overflow={headerSpill ? "visible" : "hidden"}
          endSafeArea={reserveEnd}
          className={
            layoutCtx?.dragHandleProps
              ? "cursor-grab active:cursor-grabbing"
              : undefined
          }
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
                  // String pane title: yields inside Bar's flex row so a long
                  // title ellipsizes rather than crushing its siblings.
                  <Text
                    as="span"
                    variant="label"
                    className={cn(yieldClass("x"), "truncate")}
                  >
                    {resolvedTitle}
                  </Text>
                ) : headerSpill ? (
                  // Node title in a spill-enabled header (e.g. a `CollapsibleWrap`).
                  // The Bar's `overflow-visible` (headerSpill) is not enough on its
                  // own: `NodeTitle`'s `<Text>` sits in the Bar's single-line context,
                  // so it would auto-apply the `truncate` recipe (`overflow:hidden`)
                  // and re-clip the very spill headerSpill opened. Reset the
                  // single-line context so the wrapper stops clipping — the node owns
                  // its own overflow, and any single-line leaf inside it (chips,
                  // `ConversationTitle`) still truncates via its own container/class.
                  <SingleLineProvider value={false}>
                    <NodeTitle>{resolvedTitle}</NodeTitle>
                  </SingleLineProvider>
                ) : (
                  // Node titles get the SAME `label` typography baseline as string
                  // titles, so a title node inherits the canonical pane-title size
                  // instead of drifting to the ambient body size. The size is
                  // enforced by the container (CSS inheritance), so title nodes need
                  // not — and should not — set their own size; per-segment weight/
                  // color (e.g. breadcrumb) still applies on top.
                  <NodeTitle>{resolvedTitle}</NodeTitle>
                ))}
              <PaneActionsSlot pane={pane} position="left" />
              {hideRightActions ? (
                <Fill />
              ) : (
                // The bar IS the row's grow cell (`min-w-0 flex-1`), which is
                // why there is no `Fill` beside it: a second claimant on the
                // same slack breaks the one contract the primitive has. Which is
                // also why `align` is the bar's own prop — nothing outside it
                // can place occupants within slack it has taken entirely.
                <AdaptiveBar gap="xs" label="More actions" align="end">
                  <PaneActionsSlot
                    pane={pane}
                    position="right"
                    extra={actions}
                  />
                </AdaptiveBar>
              )}
            </>
          )}
          {chrome.promote && promote && (
            <PaneIconAction
              label={
                promote.kind === "cross-app"
                  ? `Open in ${promote.app.name}`
                  : "Expand pane"
              }
              icon={MdOpenInFull}
              {...linkGestureProps(promote.run)}
            />
          )}
          {chrome.close && doClose && (
            <PaneIconAction label="Close" icon={MdClose} onClick={doClose} />
          )}
        </Bar>
      }
      // The pane body owns exactly one scroll, expressed via the shared
      // `PaneScroll` scaffold (`<Scroll axis="y" fill h-full>`) instead of
      // Column's managed `Scroll` body — identical scrolling, one sanctioned
      // idiom. `scrollBody={false}` so Column doesn't add a second scroll.
      scrollBody={false}
      body={
        overlay == null ? (
          <PaneScroll>
            <ContentScope>{children}</ContentScope>
          </PaneScroll>
        ) : (
          // positioning host for the pane's overlay layer: it must be the scroller's PARENT (an absolute child of a scroller scrolls away) and sit below the header
          <div className="relative isolate h-full">
            <PaneScroll>
              <ContentScope>{children}</ContentScope>
            </PaneScroll>
            {overlay}
          </div>
        )
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

/**
 * A non-string pane title (a breadcrumb, a chip row, a `CollapsibleWrap`).
 *
 * It gets the SAME `label` typography baseline as a string title, so a title
 * node inherits the canonical pane-title size instead of drifting to the ambient
 * body size. The size is enforced by this container (CSS inheritance), so title
 * nodes need not — and should not — set their own; per-segment weight/color (e.g.
 * a breadcrumb's) still composes on top.
 *
 * One component for both header branches — the spill branch differs only by the
 * `SingleLineProvider` around it, so the markup itself has one home.
 */
function NodeTitle({ children }: { children: ReactNode }) {
  return (
    // `Line` is nearly this — `flex items-center` — but composing it here inverts
    // the display class: `Text` passes its own single-line leaf recipe
    // (`inline-block …`) down as `className`, which `cn` then resolves as the
    // WINNER over `Line`'s `flex`, so the row silently stops being a row. Hence a
    // raw class, kept on one prettier-stable line so the directive cannot drift.
    // eslint-disable-next-line layout/no-adhoc-layout -- node title needs a flex row for breadcrumb-style multi-segment compositions; see above for why Line cannot supply it
    <Text as="div" variant="label" className="flex min-w-0 items-center">
      {children}
    </Text>
  );
}

function chromeTitle(pane: AnyPane, match: PaneMatch | null): ReactNode {
  const chrome = pane._internal.chrome;
  if (chrome.title === undefined) return null;
  if (typeof chrome.title === "string") return chrome.title;
  const entry = match?.panes.find((e) => e.pane === pane._internal);
  if (!entry) return null;
  return chrome.title(entry.fullParams);
}

/**
 * A pane's `Actions` contributions for one side.
 *
 * Each contribution is wrapped in an `AdaptiveBar.Item` UNCONDITIONALLY — the
 * item is transparent when there is no bar above it, so `position="left"`
 * (which renders straight into the pane `Bar`) gets exactly what it always got,
 * and `position="right"` becomes an occupant of the header's `AdaptiveBar`
 * without this component having to know which side it is on.
 *
 * The right side renders a bare fragment rather than a wrapper element, and
 * that is structural, not cosmetic: the bar docks each occupant's container
 * immediately before that occupant's own anchor, as a direct child of the bar
 * root. An anchor nested inside a wrapper would have no such placement. The
 * `gap` comes from the bar itself.
 */
export function PaneActionsSlot({
  pane,
  position = "right",
  extra,
}: {
  pane: AnyPane;
  position?: "left" | "right";
  /**
   * The host's own per-instance control, joining the contributed ones as one
   * more bar occupant under the id `pane-extra`. Named `extra` rather than
   * `actions` because it is one header control, not the hover-revealed trailing
   * cluster `row-actions/no-raw-actions-slot` guards — that rule's vocabulary
   * and a pane header's are two different things.
   */
  extra?: ReactNode;
}) {
  const contributions = pane.Actions.useContributions().filter(
    (a) => (a.position ?? "right") === position,
  );
  if (contributions.length === 0 && extra == null) return null;
  const items = contributions.map((a) => (
    <AdaptiveBar.Item key={a.id} id={a.id}>
      {renderIsolated(pane.Actions.id, a as unknown as Contribution)}
    </AdaptiveBar.Item>
  ));
  if (extra != null) {
    items.push(
      <AdaptiveBar.Item key="pane-extra" id="pane-extra">
        {extra}
      </AdaptiveBar.Item>,
    );
  }
  if (position === "right") return <>{items}</>;
  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- horizontal chip row of action contributions inside Bar; Frame needs named slots but this is a dynamic list
    <div className="flex items-center gap-xs">{items}</div>
  );
}

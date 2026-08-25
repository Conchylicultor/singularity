import { linkGestureProps } from "@plugins/primitives/plugins/link-gesture/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { useContext, useMemo, type ReactNode } from "react";
import { AdaptiveBar } from "@plugins/primitives/plugins/adaptive-bar/web";
import { MdClose, MdOpenInFull } from "react-icons/md";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { PaneScroll } from "./pane-scroll";
import { PaneIconAction } from "./pane-icon-action";
import { PaneHeaderCell, type PaneHeaderItem } from "./pane-header-item";
import { PaneTitleContext, type PaneTitleValue } from "./pane-title";
import { usePaneMatch, type PaneMatch, type AnyPane } from "../pane";
import { PaneLayoutContext } from "../maximize-context";
import { SurfaceChromeContext } from "../surface-chrome-context";

interface PaneChromeProps {
  pane: AnyPane;
  /**
   * Header title. When omitted, falls back to the pane's `chrome.title`
   * config (string or `(params) => string`). Pass a node when the title
   * needs loaded data (e.g. a task name) or custom layout.
   *
   * Either way the title is PUBLISHED, not painted here: the pane's own
   * `title` header contribution reads the resolved value off
   * {@link PaneTitleContext} and renders it, so it is one item of the header's
   * one slot — orderable and hideable like every other.
   */
  title?: ReactNode;
  /**
   * Per-instance header control, joining the contributed items as one more bar
   * occupant under the id `pane-extra`. Use for stateful, host-coupled controls
   * (e.g. file-pane tabs) that don't fit the contribution model.
   *
   * Named `extra` and not `actions` because it is ONE header control, not the
   * hover-revealed trailing cluster that `row-actions/no-raw-actions-slot`
   * guards — that rule's vocabulary and a pane header's are two different
   * things. A cluster owns a reveal, a popup-hold, a pointerdown guard and a
   * pinned box, and must render through `RowActions`; this owns none of them.
   * It is a bar occupant, measured and relocated behind the `⋯` like every
   * contributed item beside it.
   */
  extra?: ReactNode;
  /**
   * Render ONLY the header's yielding cell — the pane title — and suppress
   * every contributed action occupant. For a host that renders those actions
   * itself somewhere else (inside its content area), while still wanting the
   * standard title + expand + close chrome.
   *
   * The rule, stated once: an item with `cell` set survives, an ordinary
   * occupant does not. `pane-extra` is an ordinary occupant and goes with them.
   */
  titleOnly?: boolean;
  /**
   * When true, the header band uses `overflow-visible` instead of the default
   * `overflow-hidden`, letting the title (e.g. a `CollapsibleWrap`) spill its
   * expanded rows DOWN over the content below without being clipped by the
   * fixed-height band. Opt in only for panes whose header can reveal overflow;
   * the band stays `h-10` so row 1 and the rest of the chrome are unaffected.
   * Default false (clip — today's behavior for every other pane).
   *
   * It opens every clip boundary between the band and the title node, and there
   * are three: the `Bar`'s own overflow, the header `AdaptiveBar`'s (the title
   * is an occupant of it), and the node-title `<Text>` wrapper, which would
   * otherwise auto-apply the single-line `truncate` recipe — i.e.
   * `overflow:hidden` — because it sits in the Bar's single-line context, and
   * re-clip the very spill this flag enables (see `PaneTitleItem`). The node
   * then owns its own overflow; single-line leaves inside it still truncate via
   * their own class.
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
 * The standard pane header: ONE overflow-collapsing bar rendering the pane's
 * one header slot, then an optional expand button and a × close button. The
 * close button is shown by default for panes with a parent (opt out via
 * `chrome: { close: false }`).
 *
 * There is no second kind of header. The title is a contribution of the same
 * slot (rendered in the bar's yielding cell), so a rich header — transport,
 * view-switcher, volume — is the ordinary case with more items in it, and it
 * collapses into the `⋯` like anything else. What separates a leading group
 * from a trailing one is a `spacer` node in the slot's reorder config, not a
 * field on the contribution.
 */
export function PaneChrome({
  pane,
  title,
  extra,
  titleOnly,
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
  const titleValue = useMemo<PaneTitleValue>(
    () => ({ title: resolvedTitle, spill: headerSpill === true }),
    [resolvedTitle, headerSpill],
  );
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
          {/* The bar IS the row's grow cell (`min-w-0 flex-1`), which is why
              there is no `Fill` beside it: a second claimant on the same slack
              breaks the one contract the primitive has. Which is also why
              `align` is the bar's own prop — nothing outside it can place
              occupants within slack it has taken entirely. With no `spacer`
              node in the slot's config, `"end"` packs the occupants right; the
              title's yielding cell holds the leftover in front of them, so a
              header with a title reads exactly as it always has and a header
              without one costs nothing. */}
          <AdaptiveBar
            gap="xs"
            label="More actions"
            align="end"
            spill={headerSpill}
          >
            <PaneTitleContext.Provider value={titleValue}>
              <pane.Actions.Render>
                {(item) => renderHeaderItem(item, titleOnly)}
              </pane.Actions.Render>
              {extra != null && !titleOnly && (
                <AdaptiveBar.Item id="pane-extra">{extra}</AdaptiveBar.Item>
              )}
            </PaneTitleContext.Provider>
          </AdaptiveBar>
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
 * One header contribution as a bar child — the ONE place `cell` is read.
 *
 * An ordinary item is an occupant: measured, laddered, and relocated behind the
 * `⋯` when the row runs out of room. A `cell: "yield"` item is the row's give
 * instead — excluded from the fit ledger, `min-w-0` so its text ellipsizes, and
 * `grow` so it holds the row's leftover in front of the trailing occupants.
 * That is the pane title's shape, and stating it as a public field rather than
 * as "the title" is what keeps the title an item like any other.
 */
function renderHeaderItem(
  item: PaneHeaderItem & { id: string },
  titleOnly?: boolean,
): ReactNode {
  if (item.cell === "yield") {
    return (
      <AdaptiveBar.Yield grow>
        <PaneHeaderCell {...item} />
      </AdaptiveBar.Yield>
    );
  }
  if (titleOnly) return null;
  return (
    <AdaptiveBar.Item id={item.id}>
      <PaneHeaderCell {...item} />
    </AdaptiveBar.Item>
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

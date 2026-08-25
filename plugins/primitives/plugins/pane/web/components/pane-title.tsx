import { SingleLineProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { createContext, useContext, type ReactNode } from "react";

/**
 * The pane title, already resolved — the `title` prop if the pane passed one,
 * otherwise its `chrome.title` config — published by `PaneChrome` for the one
 * contribution that paints it.
 *
 * The title is authored exactly where it always was (`chrome.title` /
 * `<PaneChrome title={…}>`) and rendered as a header contribution like anything
 * else, so it is orderable and hideable. Those two facts meet here: the pane
 * hands the resolved title DOWN a context, and the contribution reads it — no
 * author re-contributes a title, and no header has to special-case one.
 */
export interface PaneTitleValue {
  /** `null` for a pane with no title at all — the item then renders nothing. */
  title: ReactNode;
  /** `PaneChrome`'s `headerSpill`: this title may paint outside the header band. */
  spill: boolean;
}

export const PaneTitleContext = createContext<PaneTitleValue | null>(null);

/**
 * The pane title as a header item (`primitives.pane:title`, contributed by this
 * plugin into every pane-header slot — see `header-slot.ts`).
 *
 * Renders `null` when the pane has no title: an item that paints nothing is
 * ordinary, and the bar sees an empty cell rather than a gap, so a title-less
 * pane header looks exactly as it did.
 */
export function PaneTitleItem(): ReactNode {
  const resolved = useContext(PaneTitleContext);
  if (resolved === null) {
    throw new Error(
      "PaneTitleItem rendered outside a PaneChrome: the pane title is resolved " +
        "by the pane (its `title` prop or `chrome.title`) and published on " +
        "PaneTitleContext, so this item only has a title to paint inside the " +
        "header PaneChrome renders.",
    );
  }
  const { title, spill } = resolved;
  if (title == null || title === "") return null;
  if (typeof title === "string") {
    // String pane title: the cell around it yields (see `PaneHeaderItem.cell`),
    // so a long title ellipsizes rather than crushing its siblings.
    return (
      <Text as="span" variant="label" className="truncate">
        {title}
      </Text>
    );
  }
  if (spill) {
    // Node title in a spill-enabled header (e.g. a `CollapsibleWrap`). The
    // bar's and the band's `overflow-visible` are not enough on their own:
    // `NodeTitle`'s `<Text>` sits in the Bar's single-line context, so it would
    // auto-apply the `truncate` recipe (`overflow:hidden`) and re-clip the very
    // spill `headerSpill` opened. Reset the single-line context so the wrapper
    // stops clipping — the node owns its own overflow, and any single-line leaf
    // inside it (chips, a conversation title) still truncates via its own
    // container/class.
    return (
      <SingleLineProvider value={false}>
        <NodeTitle>{title}</NodeTitle>
      </SingleLineProvider>
    );
  }
  return <NodeTitle>{title}</NodeTitle>;
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
 * One component for both branches — the spill branch differs only by the
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

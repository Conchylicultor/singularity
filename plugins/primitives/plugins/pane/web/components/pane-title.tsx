import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { createContext, useContext, type ReactNode } from "react";
import { usePaneTitle, type MatchEntry, type PaneInternal } from "../pane";

/**
 * What `PaneChrome` publishes for the one contribution that paints the pane
 * title: the pane whose header this is, and its match entry (the params, hint
 * and options the title is resolved from).
 *
 * The title is declared once, on `Pane.define({ title })`, and rendered as a
 * header contribution like anything else, so it is orderable and hideable.
 * Those two facts meet here: the pane hands itself DOWN a context, and the
 * contribution resolves and paints the title — no author re-contributes one,
 * and no header has to special-case it.
 */
export interface PaneTitleValue {
  pane: PaneInternal;
  /** `null` when the pane is not in the current match (no params to resolve from). */
  entry: MatchEntry | null;
}

export const PaneTitleContext = createContext<PaneTitleValue | null>(null);

/**
 * The pane title as a header item (`primitives.pane:title`, contributed by this
 * plugin into every pane-header slot — see `header-slot.ts`).
 *
 * Paints the pane's `title.component` when it declares one, else the string
 * {@link usePaneTitle} resolves (`title.useText`, then `title.fallback`) — the same
 * string the tab shows. Renders `null` when there is none: an item that paints
 * nothing is ordinary, and the bar sees an empty cell rather than a gap.
 */
export function PaneTitleItem(): ReactNode {
  const resolved = useContext(PaneTitleContext);
  if (resolved === null) {
    throw new Error(
      "PaneTitleItem rendered outside a PaneChrome: the pane title is declared " +
        "on `Pane.define({ title })` and published on PaneTitleContext by the " +
        "header PaneChrome renders, so this item only has a title to paint there.",
    );
  }
  const { pane, entry } = resolved;
  const Component = pane.title.component;
  if (Component) {
    return (
      <NodeTitle>
        <Component />
      </NodeTitle>
    );
  }
  if (entry === null) {
    // Off-route: no params to run `title.useText` against — only a literal
    // fallback can be shown honestly.
    const { fallback } = pane.title;
    return typeof fallback === "string" ? <TextTitle title={fallback} /> : null;
  }
  // Keyed by pane: `title.useText` is a hook that varies per pane.
  return <ResolvedTextTitle key={pane.id} pane={pane} entry={entry} />;
}

function ResolvedTextTitle({
  pane,
  entry,
}: {
  pane: PaneInternal;
  entry: MatchEntry;
}): ReactNode {
  const title = usePaneTitle(pane, entry.fullParams, entry.hint, entry.options);
  if (title === undefined || title === "") return null;
  return <TextTitle title={title} />;
}

/**
 * String pane title: the cell around it yields (see `PaneHeaderItem.cell`), so
 * a long title ellipsizes rather than crushing its siblings.
 */
function TextTitle({ title }: { title: string }): ReactNode {
  return (
    <Text as="span" variant="label" className="truncate">
      {title}
    </Text>
  );
}

/**
 * A `title.component` (a breadcrumb, an editable field).
 *
 * It gets the SAME `label` typography baseline as a string title, so a title
 * node inherits the canonical pane-title size instead of drifting to the ambient
 * body size. The size is enforced by this container (CSS inheritance), so title
 * nodes need not — and should not — set their own; per-segment weight/color (e.g.
 * a breadcrumb's) still composes on top.
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

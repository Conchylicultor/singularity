import type { ReactNode } from "react";
import { usePageNavigation } from "./navigation";
import { PageReference } from "./slots";

/**
 * The action cluster for one page reference, ready to hand to a `Row`'s
 * `actions` prop — or `null` when this reference has no action to offer, so the
 * row renders exactly as it did before this plugin existed.
 *
 * A HOOK returning a node rather than a component, and the `null` is the reason.
 * `Row` decides whether to paint an action cluster from whether it was GIVEN
 * actions, and a component that renders nothing is still something it was given:
 * the row would pin an empty scrim box over its right edge and dissolve the tail
 * of a long title on hover, with no buttons in it. The emptiness therefore has
 * to be answered before `Row` is called, which is here.
 *
 * Which actions apply is each action's own declaration (`available` on the
 * contribution) — this asks nothing about what any of them does.
 */
export function usePageReferenceActions(pageId: string): ReactNode {
  const nav = usePageNavigation();
  const contributions = PageReference.Actions.useContributions();
  const shown = new Set(
    contributions
      .filter((action) => action.available?.(nav) ?? true)
      .map((action) => action.id),
  );
  if (shown.size === 0) return null;
  return (
    <PageReference.Actions.Render>
      {(action) =>
        shown.has(action.id) ? <action.component pageId={pageId} /> : null
      }
    </PageReference.Actions.Render>
  );
}

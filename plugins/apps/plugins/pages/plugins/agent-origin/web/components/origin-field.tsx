import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { useWindowResource } from "@plugins/primitives/plugins/live-state/web";
import type { PageRow } from "@plugins/page/plugins/editor/core";
import { agentPagesResource } from "../../shared/resources";

/**
 * Field extension contributed into the page-tree's `PageTree.Fields` factory: a
 * render-callback component that reads this plugin's own live agent-pages
 * resource into a `Set<string>` and yields one `origin` enum `FieldDef<PageRow>`
 * closed over the set. That makes `origin` a group/filter dimension of the one
 * `pages-sidebar` DataView — the `[Agent]` section is just `groupBy: "origin"`
 * authored in that view's config, with no bespoke sidebar.
 */
export function OriginField({ render }: FieldExtensionProps<PageRow>) {
  // An empty set while pending is the correct read: every page then projects
  // "user", so the tree renders exactly as it did before this plugin existed
  // until the resource settles — never a flash of pages under `Agent` and never
  // an unresolvable rule.
  const result = useWindowResource(agentPagesResource);
  const agentIds = useMemo(() => {
    if (result.pending) return new Set<string>();
    return new Set(result.data.map((r) => r.parentId));
  }, [result]);
  const fields = useMemo<FieldDef<PageRow>[]>(
    () => [
      {
        id: "origin",
        label: "Origin",
        type: "enum",
        options: [
          { value: "user", label: "Mine" },
          { value: "agent", label: "Agent" },
        ],
        // Unmarked rows project "user", never null — so there is no "None"
        // bucket, and the section order follows `options`: Mine, then Agent.
        value: (b) => (agentIds.has(b.id) ? "agent" : "user"),
        // Search-accessor only: keeping `origin` out of the full-text search
        // accessor (it is a grouping dimension, not searchable text). It stays
        // in the Filter pill, which is gated on the field type resolving
        // operators.
        filterable: false,
        // `groupable` is left at its enum DEFAULT (true) — deliberately UNLIKE
        // the sibling `starred` field, which opts out because a group-by
        // silently disables `rowOrderEnabled`. Here that trade-off is inverted
        // and accepted: segregating agent pages into their own section IS the
        // feature, and grouping is the only mechanism that does it. The cost is
        // that the Pages tree's drag-reorder is suspended while grouping is on
        // (a per-section TreeList sees only its own roots and could mint a
        // colliding rank against a hidden root in another section) — a
        // data-view primitive limitation, tracked as its own follow-up.
      },
    ],
    [agentIds],
  );
  return <>{render(fields)}</>;
}

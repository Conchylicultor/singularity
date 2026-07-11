import { MdMyLocation, MdHub } from "react-icons/md";
import { cn, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import {
  useActiveMembership,
  useDiffMap,
  useEnsureCompositionData,
  pinAsRoot,
  type DiffState,
} from "@plugins/plugin-meta/plugins/composition/web";
import { graphCanvasPane } from "@plugins/apps/plugins/studio/plugins/graph/web";
import { STATE_TINT } from "@plugins/apps/plugins/studio/plugins/membership-tint/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

// COMPARE-mode tints, sourced from the themeable categorical palette so they read
// as a deliberately DIFFERENT scheme from the single-composition membership tints
// above (primary/success/info). The four diff states get four distinct hues:
// only-A and only-B are the symmetric difference (the delta) and so carry the
// strongest tints; `both` is a faint shared-bundle wash; `neither` has no band.
// Centralized here and re-exported as DIFF_LEGEND so the pane legend never drifts.
export const DIFF_TINT: Record<Exclude<DiffState, "neither">, string> = {
  "only-a": "bg-categorical-4/30",
  "only-b": "bg-categorical-7/30",
  both: "bg-categorical-2/12",
};

/** Legend rows for the four diff states, in display order. */
export const DIFF_LEGEND: { state: DiffState; label: string; tint: string | null }[] = [
  { state: "only-a", label: "Only in A", tint: DIFF_TINT["only-a"] },
  { state: "only-b", label: "Only in B", tint: DIFF_TINT["only-b"] },
  { state: "both", label: "In both", tint: DIFF_TINT.both },
  { state: "neither", label: "In neither", tint: null },
];

/**
 * Full-row membership/diff wash, contributed to `Explorer.TreeRowAccent`. Lives
 * inside RowChrome's `pointer-events-none absolute inset-0` accent layer, so it
 * only paints the tint — RowChrome owns the positioning.
 */
export function MembershipTint({ node }: { node: PluginNode }) {
  // Ensure the closure graph is fetched + published to the store so membership can
  // resolve. Shared (deduped) across every row; returns nothing.
  useEnsureCompositionData();
  const membership = useActiveMembership();
  const diff = useDiffMap();

  // Compare mode (both A and B set) → tint by diff state, a distinct scheme from
  // the single-composition membership tints. `neither` gets no band.
  let tint: string | null;
  if (diff) {
    const dstate = diff.get(node.id) ?? "neither";
    tint = dstate === "neither" ? null : DIFF_TINT[dstate];
  } else if (!membership) {
    // No active composition → no tint by default.
    return null;
  } else {
    const state = membership.get(node.id) ?? "excluded";
    tint = state === "excluded" ? null : STATE_TINT[state];
  }

  return tint ? <div aria-hidden className={cn("size-full", tint)} /> : null;
}

/**
 * Hover-revealed pin + graph affordances, contributed to `Explorer.TreeRowBadge`
 * (the trailing actions cluster). Independent of composition data — `pinAsRoot`
 * and `openPane` don't need the closure graph fetched.
 */
export function MembershipPin({ node }: { node: PluginNode }) {
  return (
    <span
      className="relative z-raised hidden group-hover/tree-row:block"
      onClick={(e) => e.stopPropagation()}
    >
      <ControlSizeProvider size="sm">
        <Cluster gap="none">
          <IconButton
            icon={MdMyLocation}
            label="Show closure from here"
            onClick={(e) => {
              e.stopPropagation();
              pinAsRoot(node.id);
            }}
          />
          <IconButton
            icon={MdHub}
            label="Open in graph"
            onClick={(e) => {
              e.stopPropagation();
              openPane(graphCanvasPane, {}, { mode: "root", options: { focusId: node.id } });
            }}
          />
        </Cluster>
      </ControlSizeProvider>
    </span>
  );
}

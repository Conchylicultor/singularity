import { useMemo, type ReactNode } from "react";
import {
  PortalForwardProvider,
  usePortalForwardedAttrs,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { RegionNode } from "../../core";
import { appendLineage, LINEAGE_ATTR, regionNodeAttrs } from "./lineage-attrs";

/**
 * Marks its children as occupying one named **region** of the screen — a miller
 * column, a tab, a floating window — so the region folds into the same lineage
 * chain as slot contributions.
 *
 * A component, not a hook returning props, on purpose: a hook cannot supply the
 * portal-forward context (that needs a provider), and a hook + spread pair means
 * forgetting the spread silently breaks the walk. One component makes the broken
 * state unrepresentable. It mirrors the picker's slot-item marker middleware
 * beat for beat.
 *
 * `position` is the producer's job, not the walk's: miller panes are SIBLINGS,
 * so an upward DOM walk from column 3 crosses only column 3's marker and can
 * never infer "3 of 3". Whoever renders the set passes it as `label`.
 *
 * `display:contents` generates no box (layout is identical to a Fragment) but
 * keeps the element in the DOM tree, and the picker's hit-testing already
 * traverses-but-never-selects boxless elements — so wrapping costs nothing.
 */
export function UiRegion({
  kind,
  id,
  label,
  pluginId,
  children,
}: {
  kind: string;
  id: string;
  label?: string;
  pluginId?: string;
  children: ReactNode;
}) {
  const inherited = usePortalForwardedAttrs()[LINEAGE_ATTR];
  const node = useMemo<RegionNode>(
    () => ({ kind: "region", regionKind: kind, id, label, pluginId }),
    [kind, id, label, pluginId],
  );
  // Memoized so the serialized chain keeps a stable identity across the region's
  // re-renders — otherwise every region render invalidates the
  // PortalForwardProvider value for every portal surface below it.
  const lineage = useMemo(() => appendLineage(inherited, node), [inherited, node]);
  return (
    <PortalForwardProvider name={LINEAGE_ATTR} value={lineage}>
      <span style={{ display: "contents" }} {...regionNodeAttrs(node)}>
        {children}
      </span>
    </PortalForwardProvider>
  );
}

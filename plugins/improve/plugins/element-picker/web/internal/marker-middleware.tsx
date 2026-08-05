import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ReactNode } from "react";
import { registerSlotItemMiddleware } from "@plugins/primitives/plugins/slot-render/web";
import {
  PortalForwardProvider,
  usePortalForwardedAttrs,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ContributionNode } from "@plugins/primitives/plugins/ui-context/core";
import {
  appendLineage,
  contributionNodeAttrs,
  LINEAGE_ATTR,
} from "@plugins/primitives/plugins/ui-context/web";

/**
 * Wraps every slot contribution in a layout-neutral `contribution` lineage node
 * carrying the owning plugin id and slot id (attribute grammar owned by
 * `primitives/ui-context`). `display:contents` generates no box (layout
 * identical to a Fragment), but the element stays in the DOM tree so the
 * `collectLineage` walk resolves the nearest (most specific) plugin — the
 * fine-grained attribution the element picker needs.
 *
 * The same node is *also* appended to the portal-forward lineage (React
 * context, which crosses portals) so a contribution that portals its content out
 * to `document.body` — popovers, dialogs, menus — re-stamps the full lineage on
 * the portaled positioner, where the DOM-ancestry walk can no longer reach the
 * span.
 *
 * This middleware stays **here**, opt-in, rather than in `ui-context`: it wraps
 * *every* slot contribution repo-wide, so that cost is only paid when the
 * element-picker is actually in the app composition. `<UiRegion>` — a handful of
 * explicit call sites — has no such constraint and lives in the primitive.
 */
export function PluginMarkerMiddleware({
  slotId,
  contribution,
  children,
}: {
  slotId: string;
  contribution: Contribution;
  children: ReactNode;
}) {
  const pluginId = contribution._pluginId ?? "";
  const contributionId = contribution.id
    ? contribution._pluginId
      ? `${contribution._pluginId}:${contribution.id as string}`
      : String(contribution.id)
    : "";
  const node: ContributionNode = {
    kind: "contribution",
    pluginId,
    slotId,
    contributionId,
  };
  const inheritedLineage = usePortalForwardedAttrs()[LINEAGE_ATTR];
  const lineage = appendLineage(inheritedLineage, node);
  return (
    <PortalForwardProvider name={LINEAGE_ATTR} value={lineage}>
      <span style={{ display: "contents" }} {...contributionNodeAttrs(node)}>
        {children}
      </span>
    </PortalForwardProvider>
  );
}

registerSlotItemMiddleware({
  priority: 50,
  Component: PluginMarkerMiddleware,
});

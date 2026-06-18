import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ReactNode } from "react";
import { registerSlotItemMiddleware } from "@plugins/primitives/plugins/slot-render/web";
import {
  PortalForwardProvider,
  usePortalForwardedAttrs,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { appendLineage, LINEAGE_ATTR } from "./marker-lineage";

/**
 * Wraps every slot contribution in a layout-neutral marker carrying the owning
 * plugin id and slot id. `display:contents` generates no box (layout identical
 * to a Fragment), but the element stays in the DOM tree so
 * `Element.closest('[data-plugin-id]')` resolves the nearest (most specific)
 * plugin — the fine-grained attribution the element picker needs.
 *
 * The same marker is *also* appended to the portal-forward lineage (React
 * context, which crosses portals) so a contribution that portals its content out
 * to `document.body` — popovers, dialogs, menus — re-stamps the full lineage on
 * the portaled positioner, where the DOM-ancestry walk can no longer reach the
 * span. This is the second consumer of the generic portal-forward bridge, after
 * theme scope.
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
  const inheritedLineage = usePortalForwardedAttrs()[LINEAGE_ATTR];
  const lineage = appendLineage(inheritedLineage, {
    pluginId,
    slotId,
    contributionId,
  });
  return (
    <PortalForwardProvider name={LINEAGE_ATTR} value={lineage}>
      <span
        style={{ display: "contents" }}
        data-plugin-id={pluginId}
        data-slot-id={slotId}
        data-contribution-id={contributionId}
      >
        {children}
      </span>
    </PortalForwardProvider>
  );
}

registerSlotItemMiddleware({
  priority: 50,
  Component: PluginMarkerMiddleware,
});

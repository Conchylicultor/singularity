import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ReactNode } from "react";
import { registerSlotItemMiddleware } from "@plugins/primitives/plugins/slot-render/web";

/**
 * Wraps every slot contribution in a layout-neutral marker carrying the owning
 * plugin id and slot id. `display:contents` generates no box (layout identical
 * to a Fragment), but the element stays in the DOM tree so
 * `Element.closest('[data-plugin-id]')` resolves the nearest (most specific)
 * plugin — the fine-grained attribution the element picker needs.
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
  return (
    <span
      style={{ display: "contents" }}
      data-plugin-id={contribution._pluginId ?? ""}
      data-slot-id={slotId}
      data-contribution-id={
        contribution.id
          ? contribution._pluginId
            ? `${contribution._pluginId}:${contribution.id as string}`
            : String(contribution.id)
          : ""
      }
    >
      {children}
    </span>
  );
}

registerSlotItemMiddleware({
  priority: 50,
  Component: PluginMarkerMiddleware,
});

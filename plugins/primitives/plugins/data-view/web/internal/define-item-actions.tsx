import type { ComponentType, ReactNode } from "react";
import {
  defineRenderSlot,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type {
  ItemActionProps,
  ItemActionsDescriptor,
  ItemActionZone,
} from "../../core";

export interface ItemActionContribution<TRow> {
  id: string;
  component: ComponentType<ItemActionProps<TRow>>;
  order?: number;
  /**
   * Whether this action deserves a permanent slot on the views that have one
   * (the gallery card's footer, the table's trailing track). Default
   * `"revealed"` — the hover cluster — so every existing contribution and every
   * view stays byte-identical until an action opts in. Views without a
   * permanent slot demote a persistent action to the revealed cluster; see
   * `useItemActionZones`.
   */
  zone?: ItemActionZone;
}

export interface ItemActions<TRow>
  extends
    RenderSlot<ItemActionContribution<TRow>>,
    ItemActionsDescriptor<TRow> {}

/**
 * Mint a per-consumer item-action slot. The returned value is **callable for
 * contributions** (`PageActions({ id, component })`, like any `defineRenderSlot`
 * result) and carries `.Row`, the `ItemActionsDescriptor` views consume. Each
 * consumer calls this once with a stable id; contributors register an action
 * once; every `<DataView>` view renders all contributions in its own trailing
 * affordance.
 */
export function defineItemActions<TRow>(id: string): ItemActions<TRow> {
  const slot = defineRenderSlot<ItemActionContribution<TRow>>(id, {
    docLabel: (p) => p.id,
  });
  const Row = ({
    row,
    hasChildren,
    zone,
  }: ItemActionProps<TRow> & { zone?: ItemActionZone }): ReactNode => (
    <slot.Render>
      {(item) => {
        // Filtering happens INSIDE the existing render callback (rather than over
        // a pre-filtered contribution list) so the slot keeps owning ordering and
        // per-item isolation. `zone` omitted on `<Row>` ⇒ no filter at all, which
        // is what keeps a view that hasn't opted into zones unchanged.
        if (zone !== undefined && (item.zone ?? "revealed") !== zone)
          return null;
        const C = item.component;
        return <C row={row} hasChildren={hasChildren} />;
      }}
    </slot.Render>
  );
  const useZones = (): Record<ItemActionZone, boolean> => {
    const items = slot.useContributions();
    return {
      persistent: items.some((item) => item.zone === "persistent"),
      revealed: items.some((item) => (item.zone ?? "revealed") === "revealed"),
    };
  };
  // `slot` is a callable function-object (like every defineRenderSlot result);
  // attach `Row`/`useZones` the same way `.Render`/`.useContributions` are attached.
  return Object.assign(slot, { Row, useZones }) as ItemActions<TRow>;
}

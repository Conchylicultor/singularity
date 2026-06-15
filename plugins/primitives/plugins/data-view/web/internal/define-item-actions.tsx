import type { ComponentType, ReactNode } from "react";
import {
  defineRenderSlot,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type { ItemActionProps, ItemActionsDescriptor } from "../../core";

export interface ItemActionContribution<TRow> {
  id: string;
  component: ComponentType<ItemActionProps<TRow>>;
  order?: number;
}

export interface ItemActions<TRow>
  extends RenderSlot<ItemActionContribution<TRow>>,
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
  const Row = ({ row, hasChildren }: ItemActionProps<TRow>): ReactNode => (
    <slot.Render>
      {(item) => {
        const C = item.component;
        return <C row={row} hasChildren={hasChildren} />;
      }}
    </slot.Render>
  );
  // `slot` is a callable function-object (like every defineRenderSlot result);
  // attach `Row` the same way `.Render`/`.useContributions` are attached.
  return Object.assign(slot, { Row }) as ItemActions<TRow>;
}

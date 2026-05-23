import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface SlotDef {
  memberName: string;
  slotId: string;
  groupName: string;
}

export const slotsFacetDef = defineFacet<SlotDef[]>("slots");

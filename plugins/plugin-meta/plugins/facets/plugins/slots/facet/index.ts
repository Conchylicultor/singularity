import { join } from "path";
import {
  createFacet,
  defineFacet,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  type SlotDef,
  readIfExists,
  stripTypes,
  parseDefineGroup,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";

export const slotsFacetDef = defineFacet<SlotDef[]>("slots");

export default createFacet<SlotDef[]>({
  def: slotsFacetDef,

  extract(ctx) {
    const src = readIfExists(join(ctx.dir, "web", "slots.ts"));
    if (!src) return [];
    return parseDefineGroup(
      stripTypes(src),
      "defineSlot",
      (memberName, slotId, groupName) => ({ memberName, slotId, groupName }),
    );
  },

  renderDoc(data, ctx) {
    if (data.length === 0) return [];
    const subIndent = `${ctx.bodyIndent}  `;
    return [
      `${subIndent}- Slots: ${data.map((s) => `\`${s.groupName}.${s.memberName}\``).join(", ")}`,
    ];
  },
});

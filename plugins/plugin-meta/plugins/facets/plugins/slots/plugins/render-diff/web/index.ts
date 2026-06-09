import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  slotsToComparable,
  type SlotDef,
} from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";

export default {
  description: "Diff renderer for the slots facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "slots",
      label: "Slots",
      toComparable: (data) => slotsToComparable(data as SlotDef[]),
    }),
  ],
} satisfies PluginDefinition;

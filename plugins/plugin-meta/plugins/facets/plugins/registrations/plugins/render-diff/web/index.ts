import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  registrationsToComparable,
  type DocMetaRegistration,
} from "@plugins/plugin-meta/plugins/facets/plugins/registrations/core";

export default {
  description: "Diff renderer for the registrations facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "registrations",
      label: "Registrations",
      toComparable: (data) =>
        registrationsToComparable(data as DocMetaRegistration[]),
    }),
  ],
} satisfies PluginDefinition;

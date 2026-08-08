import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMuseum } from "react-icons/md";
import { EventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import { DMDA_SOURCE_TYPE_ID, dmdaSourceConfigFields } from "../core";
import { dmdaSourceOriginUrl } from "./internal/origin-url";

// No form component, on purpose: the add/configure form is rendered generically
// from `configFields` — the same record the server validates the row's `config`
// against.
export default {
  description:
    "Des Mots et Des Arts source type in the Events `+` menu: contributes the `dmda` type with its generic category picker.",
  contributions: [
    EventSources.Type({
      id: DMDA_SOURCE_TYPE_ID,
      label: "Des Mots et Des Arts",
      icon: MdMuseum,
      configFields: dmdaSourceConfigFields,
      originUrl: dmdaSourceOriginUrl,
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLanguage } from "react-icons/md";
import { EventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import { URL_SOURCE_TYPE_ID, urlSourceConfigFields } from "../core";

// No form component, on purpose: the add/configure form is rendered generically
// from `configFields` — the same record the server validates the row's `config`
// against. A source type that ships form code has already lost that guarantee.
export default {
  description:
    "Web-page source type in the Events `+` menu: contributes the `url` type with its generic URL + extraction-hint form.",
  contributions: [
    EventSources.Type({
      id: URL_SOURCE_TYPE_ID,
      label: "Web page",
      icon: MdLanguage,
      configFields: urlSourceConfigFields,
    }),
  ],
} satisfies PluginDefinition;

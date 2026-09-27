import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { EventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import {
  COWORKMEET_SOURCE_TYPE_ID,
  coworkmeetSourceConfigFields,
} from "../core";
import { coworkmeetSourceOriginUrl } from "./internal/origin-url";
import { symbol } from "@plugins/ui/plugins/icons/core";

// No form component, on purpose: the add/configure form — five multi-selects
// over the association's own venue vocabulary — is rendered generically from
// `configFields`, the same record the server validates the row's `config`
// against.
export default {
  description:
    "CoworkMeet source type in the Events `+` menu: contributes the `coworkmeet` type with its session-type / district / ambiance / noise / power-outlet filters.",
  contributions: [
    EventSources.Type({
      id: COWORKMEET_SOURCE_TYPE_ID,
      label: "CoworkMeet",
      icon: symbol("groups"),
      configFields: coworkmeetSourceConfigFields,
      originUrl: coworkmeetSourceOriginUrl,
    }),
  ],
} satisfies PluginDefinition;

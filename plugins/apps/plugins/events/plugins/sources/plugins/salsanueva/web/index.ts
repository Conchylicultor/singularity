import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { EventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import {
  SALSANUEVA_SOURCE_TYPE_ID,
  salsanuevaSourceConfigFields,
} from "../core";
import { salsanuevaSourceOriginUrl } from "./internal/origin-url";

// No form component, on purpose: the add/configure form — seven multi-selects
// mirroring the school's own filter bar — is rendered generically from
// `configFields`, the same record the server validates the row's `config`
// against.
export default {
  description:
    "SalsaNueva source type in the Events `+` menu: contributes the `salsanueva` type with its dance / style / level / school / teacher / day filters.",
  contributions: [
    EventSources.Type({
      id: SALSANUEVA_SOURCE_TYPE_ID,
      label: "SalsaNueva",
      icon: MdMusicNote,
      configFields: salsanuevaSourceConfigFields,
      originUrl: salsanuevaSourceOriginUrl,
    }),
  ],
} satisfies PluginDefinition;

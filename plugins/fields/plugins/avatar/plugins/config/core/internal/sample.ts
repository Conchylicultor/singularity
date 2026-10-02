import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { parseSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { avatarField } from "./avatar";

/** The avatar field's fixed gallery sample (see `FieldSample`). */
export const avatarSample = fieldSample(
  avatarField({
    label: "Avatar",
    description: "The icon and colour shown beside this agent.",
  }),
  { icon: parseSavedSymbolName("rocket-launch"), color: "violet" },
);

import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { parseSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { iconField } from "./icon";

/** The icon field's fixed gallery sample (see `FieldSample`). */
export const iconSample = fieldSample(
  iconField({
    label: "Icon",
    description: "The glyph shown beside this view in the switcher.",
  }),
  parseSavedSymbolName("inbox"),
);

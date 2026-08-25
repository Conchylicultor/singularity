import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { colorFieldType } from "@plugins/fields/plugins/color/core";
import { ColorPickerPopover } from "@plugins/primitives/plugins/css/plugins/color-picker/web";
import type { ColorFieldDef } from "../../core";

/** A swatch sizes to itself, so it takes the row's value cell `inline`. */
const ColorRenderer = defineFieldShape({
  type: colorFieldType,
  useShape: ({ field, value, onChange }) => {
    const { swatches, showAlpha } = field as ColorFieldDef;
    return {
      kind: "value",
      fit: "inline",
      control: (
        <ColorPickerPopover
          value={value}
          onChange={onChange}
          swatches={swatches as string[] | undefined}
          showAlpha={showAlpha}
        />
      ),
    };
  },
});

export { ColorRenderer };

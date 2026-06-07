import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { ColorPickerPopover } from "@plugins/primitives/plugins/color-picker/web";
import { colorFieldType } from "@plugins/fields/plugins/color/core";
import type { ColorFieldDef } from "../../core";

const ColorRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { swatches, showAlpha } = field as ColorFieldDef;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <FieldHeader field={field} />
      <ColorPickerPopover
        value={value}
        onChange={onChange}
        swatches={swatches as string[] | undefined}
        showAlpha={showAlpha}
      />
    </div>
  );
};
ColorRenderer.type = colorFieldType;

export { ColorRenderer };

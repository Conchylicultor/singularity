import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { ColorPickerPopover } from "@plugins/primitives/plugins/css/plugins/color-picker/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { colorFieldType } from "@plugins/fields/plugins/color/core";
import type { ColorFieldDef } from "../../core";

const ColorRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { swatches, showAlpha } = field as ColorFieldDef;
  return (
    <Frame
      align="start"
      gap="lg"
      className="py-md"
      content={<FieldHeader field={field} />}
      trailing={
        <ColorPickerPopover
          value={value}
          onChange={onChange}
          swatches={swatches as string[] | undefined}
          showAlpha={showAlpha}
        />
      }
    />
  );
};
ColorRenderer.type = colorFieldType;

export { ColorRenderer };

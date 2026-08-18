import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { ColorPickerPopover } from "@plugins/primitives/plugins/css/plugins/color-picker/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { colorFieldType } from "@plugins/fields/plugins/color/core";
import type { ColorFieldDef } from "../../core";

const ColorRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { swatches, showAlpha } = field as ColorFieldDef;
  return (
    <Stack
      direction="row"
      gap="lg"
      align="start"
      justify="between"
      className="py-md"
    >
      <FieldHeader field={field} />
      <ColorPickerPopover
        value={value}
        onChange={onChange}
        swatches={swatches as string[] | undefined}
        showAlpha={showAlpha}
      />
    </Stack>
  );
};
ColorRenderer.type = colorFieldType;

export { ColorRenderer };

import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import { ColorPickerPopover } from "@plugins/primitives/plugins/color-picker/web";
import { colorFieldType, type ColorFieldDef } from "../../core";

const ColorRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { swatches, showAlpha } = field as ColorFieldDef;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        {field.meta.label ? (
          <label className="text-sm font-medium">{field.meta.label}</label>
        ) : null}
        {field.meta.description ? (
          <p className="text-xs text-muted-foreground">
            {field.meta.description}
          </p>
        ) : null}
      </div>
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

import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { boolFieldType } from "@plugins/fields/plugins/bool/core";

const BoolRenderer: FieldRendererComponent<boolean> = ({
  field,
  value,
  onChange,
}) => {
  return (
    <Stack
      direction="row"
      gap="lg"
      align="start"
      justify="between"
      className="py-md"
    >
      <FieldHeader field={field} />
      <input
        type="checkbox"
        // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset to align the checkbox with the field header baseline
        className="mt-1 h-4 w-4 cursor-pointer"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Stack>
  );
};
BoolRenderer.type = boolFieldType;

export { BoolRenderer };

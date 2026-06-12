import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { boolFieldType } from "@plugins/fields/plugins/bool/core";

const BoolRenderer: FieldRendererComponent<boolean> = ({
  field,
  value,
  onChange,
}) => {
  return (
    <div className="flex items-start justify-between gap-lg py-md">
      <FieldHeader field={field} />
      <input
        type="checkbox"
        // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset to align the checkbox with the field header baseline
        className="mt-1 h-4 w-4 cursor-pointer"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
};
BoolRenderer.type = boolFieldType;

export { BoolRenderer };

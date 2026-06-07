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
    <div className="flex items-start justify-between gap-4 py-3">
      <FieldHeader field={field} />
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 cursor-pointer"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
};
BoolRenderer.type = boolFieldType;

export { BoolRenderer };

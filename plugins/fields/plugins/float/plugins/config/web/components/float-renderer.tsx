import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  FieldHeader,
  useLocalValue,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { floatFieldType } from "@plugins/fields/plugins/float/core";
import { type FloatFieldDef } from "../../core";

const FloatRenderer: FieldRendererComponent<number> = ({
  field,
  value,
  onChange,
}) => {
  const { min, max, step } = field as FloatFieldDef;
  const { local, setLocal, focus } = useLocalValue(String(value));
  return (
    <div className="flex flex-col gap-xs py-md">
      <FieldHeader field={field} />
      <Input
        type="number"
        value={local}
        min={min}
        max={max}
        step={step ?? "any"}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          const n = Number(local);
          if (Number.isFinite(n) && n !== value) onChange(n);
          else setLocal(String(value));
        }}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
};
FloatRenderer.type = floatFieldType;

export { FloatRenderer };

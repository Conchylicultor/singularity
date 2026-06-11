import { Input } from "@plugins/primitives/plugins/ui-kit/web";
import {
  FieldHeader,
  useLocalValue,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { intFieldType } from "@plugins/fields/plugins/int/core";
import { type IntFieldDef } from "../../core";

const IntRenderer: FieldRendererComponent<number> = ({
  field,
  value,
  onChange,
}) => {
  const { min, max, step } = field as IntFieldDef;
  const { local, setLocal, focus } = useLocalValue(String(value));
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      <Input
        type="number"
        value={local}
        min={min}
        max={max}
        step={step ?? 1}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          const n = Math.round(Number(local));
          if (Number.isFinite(n) && n !== value) onChange(n);
          else setLocal(String(value));
        }}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
};
IntRenderer.type = intFieldType;

export { IntRenderer };

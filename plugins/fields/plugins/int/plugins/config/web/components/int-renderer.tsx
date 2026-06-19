import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  FieldHeader,
  useLocalValue,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
    <Stack gap="xs" className="py-md">
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
    </Stack>
  );
};
IntRenderer.type = intFieldType;

export { IntRenderer };

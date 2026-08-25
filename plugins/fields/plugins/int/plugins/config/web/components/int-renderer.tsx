import {
  defineFieldShape,
  useLocalValue,
} from "@plugins/config_v2/plugins/fields/web";
import { intFieldType } from "@plugins/fields/plugins/int/core";
import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type IntFieldDef } from "../../core";

const IntRenderer = defineFieldShape({
  type: intFieldType,
  useShape: ({ field, value, onChange }) => {
    const { min, max, step } = field as IntFieldDef;
    const { local, setLocal, focus } = useLocalValue(String(value));
    return {
      kind: "value",
      fit: "field",
      control: (
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
      ),
    };
  },
});

export { IntRenderer };

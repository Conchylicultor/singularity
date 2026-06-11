import { Input } from "@plugins/primitives/plugins/ui-kit/web";
import {
  FieldHeader,
  useLocalValue,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { textFieldType } from "@plugins/fields/plugins/text/core";

const TextRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { local, setLocal, focus } = useLocalValue(value);
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      <Input
        value={local}
        placeholder={field.meta.placeholder}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          if (local !== value) onChange(local);
        }}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
};
TextRenderer.type = textFieldType;

export { TextRenderer };

import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  FieldHeader,
  useLocalValue,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { textFieldType } from "@plugins/fields/plugins/text/core";

const TextRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { local, setLocal, focus } = useLocalValue(value);
  return (
    <Stack gap="xs" className="py-md">
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
    </Stack>
  );
};
TextRenderer.type = textFieldType;

export { TextRenderer };

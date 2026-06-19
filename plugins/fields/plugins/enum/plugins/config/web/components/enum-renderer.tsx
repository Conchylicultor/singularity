import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import type { EnumFieldDef } from "../../core";
import { enumFieldType } from "@plugins/fields/plugins/enum/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const EnumRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { options, display } = field as EnumFieldDef;
  const useRadio =
    display === "radio" || (display !== "dropdown" && options.length <= 3);

  return (
    <Stack gap="xs" className="py-md">
      <Stack gap="2xs">
        {field.meta.label ? (
          <Text as="label" variant="label">
            {field.meta.label}
          </Text>
        ) : null}
        {field.meta.description ? (
          <Text as="p" variant="caption" tone="muted">
            {field.meta.description}
          </Text>
        ) : null}
      </Stack>
      {useRadio ? (
        <RadioGroup options={options} value={value} onChange={onChange} />
      ) : (
        <DropdownSelect options={options} value={value} onChange={onChange} />
      )}
    </Stack>
  );
};
EnumRenderer.type = enumFieldType;

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: readonly EnumFieldDef["options"][number][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Stack gap="xs" role="radiogroup">
      {options.map((opt) => (
        <Stack
          as="label"
          direction="row"
          align="center"
          gap="sm"
          key={opt.value}
          className="cursor-pointer"
        >
          <input
            type="radio"
            name="enum-field"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          <Text variant="body">{opt.label}</Text>
        </Stack>
      ))}
    </Stack>
  );
}

function DropdownSelect({
  options,
  value,
  onChange,
}: {
  options: readonly EnumFieldDef["options"][number][];
  value: string;
  onChange: (value: string) => void;
}) {
  const items = Object.fromEntries(options.map((opt) => [opt.value, opt.label]));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { EnumRenderer };

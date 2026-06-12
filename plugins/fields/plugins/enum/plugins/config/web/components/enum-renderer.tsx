import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plugins/primitives/plugins/ui-kit/web";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import type { EnumFieldDef } from "../../core";
import { enumFieldType } from "@plugins/fields/plugins/enum/core";
import { Text } from "@plugins/primitives/plugins/text/web";

const EnumRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { options, display } = field as EnumFieldDef;
  const useRadio =
    display === "radio" || (display !== "dropdown" && options.length <= 3);

  return (
    <div className="flex flex-col gap-xs py-md">
      <div className="flex flex-col gap-2xs">
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
      </div>
      {useRadio ? (
        <RadioGroup options={options} value={value} onChange={onChange} />
      ) : (
        <DropdownSelect options={options} value={value} onChange={onChange} />
      )}
    </div>
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
    <div role="radiogroup" className="flex flex-col gap-xs">
      {options.map((opt) => (
        <Text
          as="label"
          variant="body"
          key={opt.value}
          className="flex cursor-pointer items-center gap-sm"
        >
          <input
            type="radio"
            name="enum-field"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          {opt.label}
        </Text>
      ))}
    </div>
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

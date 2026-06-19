import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import { dynamicEnumFieldType } from "@plugins/fields/plugins/dynamic-enum/core";
import type { DynamicEnumFieldDef } from "../../core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { DynamicEnum, type DynamicEnumOption } from "../internal/slots";

const DynamicEnumRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const contributions = DynamicEnum.Options.useContributions();
  const match = contributions.find((c) => c.field === field);

  if (!match) {
    return <TextFallback field={field} value={value} onChange={onChange} />;
  }

  return (
    <ResolvedEnum
      useOptions={match.useOptions}
      value={value}
      onChange={onChange}
      field={field as DynamicEnumFieldDef}
    />
  );
};
DynamicEnumRenderer.type = dynamicEnumFieldType;

function ResolvedEnum({
  useOptions,
  value,
  onChange,
  field,
}: {
  useOptions: () => readonly DynamicEnumOption[];
  value: string;
  onChange: (v: string) => void;
  field: DynamicEnumFieldDef;
}) {
  const options = useOptions();
  const useRadio =
    field.display === "radio" ||
    (field.display !== "dropdown" && options.length <= 3);

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
}

function TextFallback({
  field,
  value,
  onChange,
}: {
  field: { meta: { label?: string; description?: string; placeholder?: string } };
  value: string;
  onChange: (v: string) => void;
}) {
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
      <input
        className="h-9 w-full rounded-md border border-input bg-transparent px-md py-xs text-body shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.meta.placeholder}
      />
    </Stack>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: readonly DynamicEnumOption[];
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
            name="dynamic-enum-field"
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
  options: readonly DynamicEnumOption[];
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

export { DynamicEnumRenderer };

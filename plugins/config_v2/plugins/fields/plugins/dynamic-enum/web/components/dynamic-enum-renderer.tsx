import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import { dynamicEnumFieldType, type DynamicEnumFieldDef } from "../../core";
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
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-col gap-0.5">
        {field.meta.label ? (
          <label className="text-sm font-medium">{field.meta.label}</label>
        ) : null}
        {field.meta.description ? (
          <p className="text-xs text-muted-foreground">
            {field.meta.description}
          </p>
        ) : null}
      </div>
      {useRadio ? (
        <RadioGroup options={options} value={value} onChange={onChange} />
      ) : (
        <DropdownSelect options={options} value={value} onChange={onChange} />
      )}
    </div>
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
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-col gap-0.5">
        {field.meta.label ? (
          <label className="text-sm font-medium">{field.meta.label}</label>
        ) : null}
        {field.meta.description ? (
          <p className="text-xs text-muted-foreground">
            {field.meta.description}
          </p>
        ) : null}
      </div>
      <input
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.meta.placeholder}
      />
    </div>
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
    <div role="radiogroup" className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            type="radio"
            name="dynamic-enum-field"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          {opt.label}
        </label>
      ))}
    </div>
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

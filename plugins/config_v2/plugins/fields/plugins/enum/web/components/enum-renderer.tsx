import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import { enumFieldType, type EnumFieldDef } from "../../core";

const EnumRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { options, display } = field as EnumFieldDef;
  const useRadio =
    display === "radio" || (display !== "dropdown" && options.length <= 3);

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
    <div role="radiogroup" className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2 text-sm"
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
  options: readonly EnumFieldDef["options"][number][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
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

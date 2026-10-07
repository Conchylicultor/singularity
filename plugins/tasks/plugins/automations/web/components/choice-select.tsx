import type { ReactElement } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/** A closed choice as a dropdown: `options` in order, the chosen one shown. */
export function ChoiceSelect<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
  ariaLabel: string;
}): ReactElement {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v: string | null) => {
        const picked = options.find((o) => o.value === v);
        if (picked !== undefined) onChange(picked.value);
      }}
    >
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

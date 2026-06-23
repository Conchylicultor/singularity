import { useState, type ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { FieldDef } from "../../../core";
import { useResolveFieldIcon } from "../../internal/use-field-icon";
import { DynamicIcon } from "../../internal/dynamic-icon";
import { FieldSearchList } from "./field-search-list";

/**
 * The field cell for an existing rule: a button showing the current field's
 * identity icon + label, opening the search-first `FieldSearchList` so changing a
 * rule's field gains the same typeahead as adding one. Selecting a field reports
 * it to the host, which resets the rule's operator to the new type's default and
 * clears the value.
 */
export function FieldPicker<TRow>(props: {
  fields: FieldDef<TRow>[];
  value: string;
  onChange: (fieldId: string) => void;
  /** Trigger button `aria-label`. Defaults to "Filter field" (the filter-builder copy). */
  label?: string;
  /** Typeahead placeholder forwarded to `FieldSearchList`. Defaults to "Filter by…". */
  placeholder?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const resolveIcon = useResolveFieldIcon();
  const current = props.fields.find((f) => f.id === props.value);
  const currentIcon = current ? resolveIcon(current.type ?? "text") : undefined;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="start"
      contentClassName="w-72"
      trigger={
        <Button
          variant="outline"
          aria-label={props.label ?? "Filter field"}
        >
          <DynamicIcon icon={currentIcon} />
          <span className="truncate">{current?.label ?? "Select field"}</span>
          <MdExpandMore />
        </Button>
      }
    >
      <FieldSearchList
        fields={props.fields}
        placeholder={props.placeholder}
        onPick={(fieldId) => {
          setOpen(false);
          props.onChange(fieldId);
        }}
      />
    </InlinePopover>
  );
}

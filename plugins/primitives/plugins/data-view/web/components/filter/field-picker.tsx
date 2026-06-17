import { useState, type ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { FieldDef } from "../../../core";
import { useResolveFieldIcon } from "../../internal/use-field-icon";
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
}): ReactNode {
  const [open, setOpen] = useState(false);
  const resolveIcon = useResolveFieldIcon();
  const current = props.fields.find((f) => f.id === props.value);
  const CurrentIcon = current ? resolveIcon(current.type ?? "text") : undefined;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="start"
      contentClassName="w-72"
      trigger={
        <Button variant="outline" size="sm" aria-label="Filter field">
          {CurrentIcon ? <CurrentIcon /> : null}
          <span className="truncate">{current?.label ?? "Select field"}</span>
          <MdExpandMore />
        </Button>
      }
    >
      <FieldSearchList
        fields={props.fields}
        onPick={(fieldId) => {
          setOpen(false);
          props.onChange(fieldId);
        }}
      />
    </InlinePopover>
  );
}

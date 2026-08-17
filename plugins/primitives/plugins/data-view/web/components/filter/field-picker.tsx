import { useState, type ReactNode } from "react";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { FieldDef } from "../../../core";
import { useResolveFieldIcon } from "../../internal/use-field-icon";
import { DynamicIcon } from "../../internal/dynamic-icon";
import { FieldSearchList } from "./field-search-list";

/**
 * The field cell of a rule row: a `ControlPanel.Field` showing the current
 * field's identity icon + label, opening the search-first `FieldSearchList` so
 * changing a rule's field gains the same typeahead as adding one. Selecting a
 * field reports it to the host, which resets the rule's operator to the new
 * type's default and clears the value.
 *
 * `ControlPanel.Field` rather than a bare `Button`: it fills its grid cell and
 * truncates its label, so picking a long field name shortens the box's text
 * instead of widening the panel.
 */
export function FieldPicker<TRow>(props: {
  fields: FieldDef<TRow>[];
  value: string;
  onChange: (fieldId: string) => void;
  /** Trigger `aria-label`. Defaults to "Filter field" (the filter-builder copy). */
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
      width="lg"
      trigger={
        <ControlPanel.Field
          aria-label={props.label ?? "Filter field"}
          icon={currentIcon ? <DynamicIcon icon={currentIcon} /> : undefined}
          label={current?.label ?? null}
          placeholder="Select field"
        />
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

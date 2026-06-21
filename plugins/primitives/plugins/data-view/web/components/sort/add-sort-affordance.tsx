import { useState, type ReactNode } from "react";
import { MdAdd } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { FieldDef } from "../../../core";
import { FieldSearchList } from "../filter/field-search-list";

/**
 * `+ Add sort` affordance. A single ghost button that opens the search-first
 * `FieldSearchList` ("Sort by…" typeahead): picking a field appends a sort level
 * on it in one click. Unlike the filter affordance there is no advanced/group
 * path — a sort is always a flat list of fields.
 */
export function AddSortAffordance<TRow>(props: {
  fields: FieldDef<TRow>[];
  onPick: (fieldId: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);

  // Wrapped in a left-packing flex row so the ghost trigger hugs its content and
  // sits at the start of the popover's vertical Stack.
  return (
    <div className="flex items-center justify-start gap-sm">
      <InlinePopover
        open={open}
        onOpenChange={setOpen}
        align="start"
        contentClassName="w-72"
        trigger={
          <Button variant="ghost" aria-label="Add sort">
            <MdAdd />
            Add sort
          </Button>
        }
      >
        <FieldSearchList
          fields={props.fields}
          placeholder="Sort by…"
          onPick={(fieldId) => {
            setOpen(false);
            props.onPick(fieldId);
          }}
        />
      </InlinePopover>
    </div>
  );
}

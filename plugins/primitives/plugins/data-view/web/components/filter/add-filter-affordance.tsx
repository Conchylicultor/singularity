import { useState, type ReactNode } from "react";
import { MdAdd, MdAccountTree } from "react-icons/md";
import {
  Button,
  DropdownMenuSeparator,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { FieldDef } from "../../../core";
import { FieldSearchList } from "./field-search-list";

/**
 * `+ Add filter` affordance. A single ghost button that opens the search-first
 * `FieldSearchList`: picking a field adds a rule on it in one click. The advanced
 * "Add filter group" path lives at the bottom of the list, so the simple flow is
 * fast while grouped/nested filters stay one click away. Used both at the root
 * footer and inside nested groups.
 */
export function AddFilterAffordance<TRow>(props: {
  fields: FieldDef<TRow>[];
  onPick: (fieldId: string) => void;
  onAddGroup: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="start"
      contentClassName="w-72"
      trigger={
        <Button
          variant="ghost"
          // eslint-disable-next-line layout/no-adhoc-layout -- per-child start-alignment override in a stretch flex parent (no primitive for self-*)
          className="self-start"
          aria-label="Add filter"
        >
          <MdAdd />
          Add filter
        </Button>
      }
    >
      <FieldSearchList
        fields={props.fields}
        onPick={(fieldId) => {
          setOpen(false);
          props.onPick(fieldId);
        }}
        footer={
          <AddGroupButton
            onClick={() => {
              setOpen(false);
              props.onAddGroup();
            }}
          />
        }
      />
    </InlinePopover>
  );
}

/**
 * The "Add filter group" advanced row, shared by the `AddFilterAffordance`
 * popover and the empty-state field list so both expose the grouped-filter path
 * identically below the field list.
 */
export function AddGroupButton(props: { onClick: () => void }): ReactNode {
  return (
    <>
      <DropdownMenuSeparator />
      <Row
        size="sm"
        hover="muted"
        icon={<MdAccountTree />}
        onClick={props.onClick}
      >
        Add filter group
      </Row>
    </>
  );
}

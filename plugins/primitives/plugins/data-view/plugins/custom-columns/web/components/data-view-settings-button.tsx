import { useState, type ReactNode } from "react";
import { MdAdd, MdDelete, MdTune } from "react-icons/md";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { CustomColumnDef } from "../../core";
import type { CustomColumnDefsController } from "../internal/use-custom-column-defs";

/**
 * One editable row in the Fields section: an inline-rename `Input` (commit on
 * blur / Enter) plus a delete `IconButton`. The input is UNCONTROLLED, keyed by
 * `def.label` so an external rename resets the draft without a sync effect; an
 * empty commit reverts to the current label.
 */
function FieldRow(props: {
  def: CustomColumnDef;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}): ReactNode {
  const { def, onRename, onDelete } = props;

  const commit = (el: HTMLInputElement) => {
    const next = el.value.trim();
    if (next === "") {
      el.value = def.label;
      return;
    }
    if (next !== def.label) onRename(def.id, next);
  };

  return (
    // simple input + trailing action row; mirrors save-preset-affordance's accepted flex idiom
    // eslint-disable-next-line layout/no-adhoc-layout
    <div className="flex items-center gap-sm">
      <Input
        key={def.label}
        defaultValue={def.label}
        aria-label={`Rename column ${def.label}`}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <IconButton
        icon={MdDelete}
        label={`Delete column ${def.label}`}
        onClick={() => onDelete(def.id)}
      />
    </div>
  );
}

/**
 * DataView Settings button — a gear `IconButton` (separate from the
 * per-view-instance switcher settings) opening a popover with a **Fields**
 * section to add / rename / delete user-defined custom columns. Text-only in v1.
 */
export function DataViewSettingsButton(props: {
  defs: CustomColumnDef[];
  actions: Omit<CustomColumnDefsController, "defs">;
}): ReactNode {
  const { defs, actions } = props;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const addColumn = () => {
    const label = draft.trim();
    if (label === "") return;
    actions.addColumn(label);
    setDraft("");
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft("");
      }}
      align="end"
      width="md"
      trigger={
        <IconButton icon={MdTune} label="Data view settings" variant="ghost" />
      }
    >
      <Stack gap="sm">
        <SectionLabel>Fields</SectionLabel>
        {defs.map((def) => (
          <FieldRow
            key={def.id}
            def={def}
            onRename={actions.renameColumn}
            onDelete={actions.deleteColumn}
          />
        ))}
        {/* add-column row: name input + Add button (Enter submits, empty disables) */}
        {/* eslint-disable-next-line layout/no-adhoc-layout */}
        <div className="flex items-center gap-sm">
          <Input
            value={draft}
            placeholder="Add column…"
            aria-label="New column name"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addColumn();
              }
            }}
          />
          <Button
            variant="secondary"
            disabled={draft.trim() === ""}
            onClick={addColumn}
          >
            <MdAdd />
            Add
          </Button>
        </div>
      </Stack>
    </InlinePopover>
  );
}

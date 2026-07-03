import { useMemo, useState, type ReactNode } from "react";
import { MdAdd, MdDelete } from "react-icons/md";
import type { FieldIdentity } from "@plugins/fields/core";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  useResolveColumnConfig,
  useFieldIdentities,
} from "@plugins/primitives/plugins/data-view/web";
import type { CustomColumnDef } from "../../core";
import type { CustomColumnDefsController } from "../internal/use-custom-column-defs";

/** Default add-column field type — the string-valued baseline that needs no config. */
const DEFAULT_TYPE = "text";

/** One `customColumn`-eligible field type, ready for the picker (id + icon + label). */
interface TypeOption {
  id: string;
  label: string;
  icon?: FieldIdentity["icon"];
}

/** Identities opted into custom columns, as picker options (icon + label). */
function useCustomColumnTypeOptions(): TypeOption[] {
  const identities = useFieldIdentities();
  return useMemo(
    () =>
      [...identities.values()]
        .filter((i) => i.customColumn)
        .map((i) => ({ id: i.type.id, label: i.label ?? i.type.id, icon: i.icon })),
    [identities],
  );
}

/** Render an option's icon + label (icon optional). */
function TypeOptionLabel({ option }: { option: TypeOption }): ReactNode {
  const Icon = option.icon;
  return (
    <Inline gap="xs">
      {Icon ? <Icon className="icon-auto" /> : null}
      {option.label}
    </Inline>
  );
}

/**
 * One editable row in the Fields section: an inline-rename `Input` (commit on
 * blur / Enter) plus a delete `IconButton`. The input is UNCONTROLLED, keyed by
 * `def.label` so an external rename resets the draft without a sync effect; an
 * empty commit reverts to the current label. The column's **type is immutable
 * after creation** — no type picker here. If the type contributes a per-type
 * config editor (e.g. enum options), it renders inline below the row wired to
 * `onSetConfig`.
 */
function FieldRow(props: {
  def: CustomColumnDef;
  onRename: (id: string, label: string) => void;
  onSetConfig: (id: string, config: unknown) => void;
  onDelete: (id: string) => void;
}): ReactNode {
  const { def, onRename, onSetConfig, onDelete } = props;
  const configEditor = useResolveColumnConfig()(def.type, {
    config: def.config,
    onChange: (next) => onSetConfig(def.id, next),
  });

  const commit = (el: HTMLInputElement) => {
    const next = el.value.trim();
    if (next === "") {
      el.value = def.label;
      return;
    }
    if (next !== def.label) onRename(def.id, next);
  };

  return (
    <Stack gap="xs">
      {/* simple input + trailing action row; mirrors save-preset-affordance's accepted flex idiom */}
      {/* eslint-disable-next-line layout/no-adhoc-layout */}
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
      {configEditor}
    </Stack>
  );
}

/**
 * Content-only **Fields** section: the add / rename / delete custom-columns UI
 * WITHOUT a popover wrapper, so it can be rendered inside the data-view host's
 * unified settings menu (the global scope).
 *
 * The add row carries a **type picker** (`customColumn`-eligible field-type
 * identities, icon + label) so a user can create typed columns (number / date /
 * checkbox / select …). The picker is add-only — a column's type is immutable
 * after creation. Per-type add-time config (e.g. enum options) is authored on the
 * created column's own row via its `DataViewSlots.ColumnConfig` editor (resolved
 * generically by type; no type-name literal lives here).
 */
export function CustomColumnsFields(props: {
  defs: CustomColumnDef[];
  actions: Omit<CustomColumnDefsController, "defs">;
}): ReactNode {
  const { defs, actions } = props;
  const [draft, setDraft] = useState("");
  const [type, setType] = useState<string>(DEFAULT_TYPE);
  const typeOptions = useCustomColumnTypeOptions();

  const addColumn = () => {
    const label = draft.trim();
    if (label === "") return;
    actions.addColumn(label, type);
    setDraft("");
  };

  const selected = typeOptions.find((o) => o.id === type);

  return (
    <Stack gap="sm">
      <SectionLabel>Fields</SectionLabel>
      {defs.map((def) => (
        <FieldRow
          key={def.id}
          def={def}
          onRename={actions.renameColumn}
          onSetConfig={actions.setColumnConfig}
          onDelete={actions.deleteColumn}
        />
      ))}
      {/* add-column row: type picker + name input + Add button (Enter submits, empty disables) */}
      {/* eslint-disable-next-line layout/no-adhoc-layout */}
      <div className="flex items-center gap-sm">
        <Select value={type} onValueChange={(v) => setType(v ?? DEFAULT_TYPE)}>
          <SelectTrigger aria-label="New column type">
            <SelectValue>
              {selected ? <TypeOptionLabel option={selected} /> : type}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <TypeOptionLabel option={option} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  );
}

import { useState, type ReactNode } from "react";
import { MdAdd, MdClose } from "react-icons/md";
import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { ColumnConfigProps } from "@plugins/primitives/plugins/data-view/web";

interface EnumOption {
  value: string;
  label: string;
}

/** Narrow the opaque config blob to the `{ options }` shape enum understands. */
function readOptions(config: unknown): EnumOption[] {
  return (config as { options?: EnumOption[] } | undefined)?.options ?? [];
}

/** Mint a stable option `value` decoupled from the label, so renaming an option
 *  never re-keys (and thus never orphans) already-stored cell values. */
function mintValue(): string {
  return crypto.randomUUID();
}

/**
 * Add-time config editor for an `enum` custom column: an options list where each
 * option's label is editable, an option can be removed, and an "Add option" row
 * appends a new `{ value, label }`. Reads/writes `config.options` opaquely
 * through `onChange` — the data-view host never inspects the shape.
 */
export function EnumOptionsEditor(props: ColumnConfigProps): ReactNode {
  const options = readOptions(props.config);
  const [draft, setDraft] = useState("");

  function commit(nextOptions: EnumOption[]) {
    props.onChange({ ...(props.config as object | undefined), options: nextOptions });
  }

  function rename(index: number, label: string) {
    commit(options.map((o, i) => (i === index ? { ...o, label } : o)));
  }

  function remove(index: number) {
    commit(options.filter((_, i) => i !== index));
  }

  function add() {
    const label = draft.trim();
    if (!label) return;
    commit([...options, { value: mintValue(), label }]);
    setDraft("");
  }

  return (
    <Stack gap="xs">
      <Text variant="label" tone="muted">
        Options
      </Text>
      {options.map((option, index) => (
        <Stack key={option.value} direction="row" align="center" gap="xs">
          <Input
            value={option.label}
            onChange={(e) => rename(index, e.target.value)}
            placeholder="Option label"
          />
          <IconButton
            icon={MdClose}
            label="Remove option"
            onClick={() => remove(index)}
          />
        </Stack>
      ))}
      <Stack direction="row" align="center" gap="xs">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add option…"
        />
        <Button variant="outline" onClick={add} disabled={draft.trim() === ""}>
          <MdAdd />
          Add
        </Button>
      </Stack>
    </Stack>
  );
}

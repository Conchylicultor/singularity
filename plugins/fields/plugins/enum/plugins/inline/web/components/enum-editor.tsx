import { useRef, useState, type ReactNode } from "react";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { CellEditorProps } from "@plugins/primitives/plugins/data-view/web";

/**
 * Compact inline enum editor: an open-by-default popover whose content is a
 * single-select vertical list of option chips. Choosing an option commits it
 * and closes; dismissing the popover cancels.
 */
export function EnumEditor(props: CellEditorProps): ReactNode {
  const [open, setOpen] = useState(true);
  const chosen = useRef(false);
  // A custom column carries its enum options on `field.config.options` (not
  // `field.options`), so fall back to it — see fields/enum column-config.
  const options =
    props.field.options ??
    (props.field.config as { options?: { value: string; label: string }[] } | undefined)
      ?.options ??
    [];
  const selected = props.value == null ? "" : String(props.value);
  const current = options.find((o) => o.value === selected);

  function choose(value: string) {
    chosen.current = true;
    setOpen(false);
    props.onCommit(value);
  }

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Dismissed without choosing an option ⇒ cancel.
        if (!next && !chosen.current) props.onCancel();
      }}
      width="xs"
      trigger={
        <span className="truncate text-body">{current?.label ?? selected}</span>
      }
    >
      <Stack gap="xs">
        {options.map((o) => (
          <ToggleChip
            key={o.value}
            active={selected === o.value}
            variant="ghost"
            onClick={() => choose(o.value)}
          >
            {o.label}
          </ToggleChip>
        ))}
      </Stack>
    </InlinePopover>
  );
}

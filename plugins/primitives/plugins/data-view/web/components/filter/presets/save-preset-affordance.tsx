import { useState, type ReactNode } from "react";
import { MdBookmarkAdd } from "react-icons/md";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";

/**
 * `Save filter as preset` footer affordance (twin of the sort version). A ghost
 * button opening an `InlinePopover` with a name `Input` + Save button (Enter
 * submits, empty name disables Save). The host disables the whole control when
 * there is no live filter to capture.
 */
export function SavePresetAffordance(props: {
  onSave: (label: string) => void;
  disabled?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const label = name.trim();
    if (label === "") return;
    props.onSave(label);
    setName("");
    setOpen(false);
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
      align="start"
      width="md"
      trigger={
        <Button
          variant="ghost"
          disabled={props.disabled}
          aria-label="Save filter as preset"
        >
          <MdBookmarkAdd />
          Save filter as preset
        </Button>
      }
    >
      <Stack gap="sm">
        <Input
          autoFocus
          value={name}
          placeholder="Preset name…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Stack direction="row" gap="sm" align="center" justify="end">
          <Button
            variant="secondary"
            disabled={name.trim() === ""}
            onClick={submit}
          >
            Save
          </Button>
        </Stack>
      </Stack>
    </InlinePopover>
  );
}

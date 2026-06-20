import { useState, type ReactNode } from "react";
import { MdBookmarkAdd } from "react-icons/md";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";

/**
 * `Save sort as preset` footer affordance. A ghost button opening an
 * `InlinePopover` with a name `Input` + Save button (Enter submits, empty name
 * disables Save) — mirrors `AddSortAffordance`'s button→popover pattern. The
 * host disables the whole control when there are no live rules to capture.
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
      contentClassName="w-64"
      trigger={
        <Button
          variant="ghost"
          disabled={props.disabled}
          aria-label="Save sort as preset"
        >
          <MdBookmarkAdd />
          Save sort as preset
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
        <Frame
          trailing={
            <Button
              variant="secondary"
              disabled={name.trim() === ""}
              onClick={submit}
            >
              Save
            </Button>
          }
        />
      </Stack>
    </InlinePopover>
  );
}

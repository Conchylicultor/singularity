import { useState, type ReactNode } from "react";
import { MdBookmarkAdd } from "react-icons/md";
import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  ControlPanel,
  usePanelStack,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";

/**
 * The pushed "Save as preset" page — a name field over a Save row. Enter submits,
 * an empty name disables Save, and saving pops back to the panel you came from.
 *
 * It is a PAGE and not a popover, which is the whole change: the footer used to
 * open an `InlinePopover` from inside the panel's own popover, so naming a preset
 * meant a second floating layer with its own width, its own clamp and its own
 * dismissal, stacked over the first.
 *
 * Both callers wrap it in a component that reads the live state it captures, so
 * "what gets saved" is whatever is in force when Save is pressed — never a
 * snapshot taken when the row was clicked.
 */
export function SavePresetPanel({
  onSave,
}: {
  onSave: (label: string) => void;
}): ReactNode {
  const { pop } = usePanelStack();
  const [name, setName] = useState("");

  const submit = () => {
    const label = name.trim();
    if (label === "") return;
    onSave(label);
    pop();
  };

  return (
    <>
      <ControlPanel.Section>
        <Input
          autoFocus
          value={name}
          placeholder="Preset name…"
          aria-label="Preset name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </ControlPanel.Section>
      <ControlPanel.Footer>
        <ControlPanel.Row
          icon={<MdBookmarkAdd />}
          disabled={name.trim() === ""}
          onSelect={submit}
        >
          Save preset
        </ControlPanel.Row>
      </ControlPanel.Footer>
    </>
  );
}

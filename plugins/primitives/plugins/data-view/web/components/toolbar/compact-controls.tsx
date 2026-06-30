import { useState, type ReactNode } from "react";
import { MdTune } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export interface CompactControlEntry {
  /** Row label rendered beside the control. */
  label: string;
  /** The control itself — the existing icon-button trigger, reused verbatim. */
  control: ReactNode;
}

/**
 * The narrow-toolbar fold for the sort / filter / fields controls. A single
 * `MdTune` trigger (ghost, or `secondary` + count badge when any rule is active)
 * opens a popover that stacks each control as a labelled row, reusing the exact
 * same trigger components the wide toolbar lays out inline — so the underlying
 * builder popovers (which nest from here) stay byte-for-byte identical.
 */
export function CompactControls({
  entries,
  activeCount,
}: {
  entries: CompactControlEntry[];
  activeCount: number;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  const active = activeCount > 0;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="xs"
      tooltip="View options"
      trigger={
        <Button
          variant={active ? "secondary" : "ghost"}
          aspect={active ? "text" : "icon"}
          aria-label="View options"
        >
          <MdTune />
          {active ? <span className="tabular-nums">{activeCount}</span> : null}
        </Button>
      }
    >
      <Stack gap="xs">
        {entries.map((e) => (
          <div
            key={e.label}
            // eslint-disable-next-line layout/no-adhoc-layout -- label↔control row inside the options popover; no named-slot primitive maps
            className="flex items-center justify-between gap-md"
          >
            <Text variant="label">{e.label}</Text>
            {e.control}
          </div>
        ))}
      </Stack>
    </InlinePopover>
  );
}

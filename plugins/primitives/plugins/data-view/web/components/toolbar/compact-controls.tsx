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
 * The narrow-toolbar fold for the search / sort / filter / fields controls. A
 * single `MdTune` trigger (ghost, or `secondary` + count badge when any rule is
 * active) opens a popover that hosts the search field full-width at the top and
 * stacks each control as a labelled row below it, reusing the exact same trigger
 * components the wide toolbar lays out inline — so the underlying builder
 * popovers (which nest from here) stay byte-for-byte identical.
 *
 * Search folds in here rather than staying an inline magnifier so the compact
 * toolbar is ONE bar: every non-switcher control is behind this single trigger,
 * and the active count (which folds in a non-empty query — see the toolbar) is
 * what makes a folded-away search visible from the outside.
 */
export function CompactControls({
  entries,
  activeCount,
  search,
}: {
  entries: CompactControlEntry[];
  activeCount: number;
  /** The search field, rendered full-width above the labelled rows. */
  search?: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (entries.length === 0 && !search) return null;
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
        {search}
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

import { useState, type ReactNode } from "react";
import { MdTune } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  ControlPanel,
  ControlPanelPopover,
  usePanelStack,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { DataViewControl } from "../../slots";
import { useDataViewControls } from "../controls/controls-context";
import { DataViewControlPanel } from "./control-panel-host";

/**
 * The narrow-toolbar fold. One `MdTune` trigger (ghost, or `secondary` + count
 * badge when anything is active) opens a panel whose first page is the search
 * field and one row per control — each showing what that control is currently
 * doing, and opening it as a PAGE.
 *
 * **There are no nested popovers.** The fold used to lay out `[label]
 * [icon-button]` rows made of the wide bar's own triggers, so opening the filter
 * from a narrow toolbar meant a popover inside a popover: a second floating
 * layer, its own width, its own clamp, its own dismissal — over a surface that
 * was narrow to begin with. A push is the same box at every depth.
 *
 * Wide and compact share one code path: both mount `DataViewControlPanel`, which
 * is prop-less and reads `useDataViewControls()`. The wide layout puts it in a
 * popover, this one puts it in a stack entry, and there is nothing left for them
 * to diverge on.
 */
export function CompactControls({
  controls,
  activeCount,
  search,
}: {
  /** The applicable controls, in order — the same list the wide bar renders. */
  controls: DataViewControl[];
  /** Σ of each control's summary count, plus one for a non-empty query. */
  activeCount: number;
  /** The search field, rendered full-width at the top of the first page. */
  search?: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (controls.length === 0 && !search) return null;
  const active = activeCount > 0;

  return (
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      // `builder`, because the widest thing this panel can host is a builder: the
      // filter and sort panels open INSIDE it now rather than in a popover of
      // their own, and a six-track rule row squeezed into menu width would be the
      // measurement-driven width this vocabulary exists to remove. The role
      // clamps itself to the available width on a narrow surface.
      size="builder"
      label="View options"
      // Idle it is an `IconButton`, which carries the tooltip — the popover has
      // no `tooltip` prop of its own, by design: the trigger owns it, and a
      // second source for the same string is how the two drift.
      trigger={
        active ? (
          <Button variant="secondary" aspect="text" aria-label="View options">
            <MdTune />
            <span className="tabular-nums">{activeCount}</span>
          </Button>
        ) : (
          <IconButton icon={MdTune} label="View options" variant="ghost" />
        )
      }
    >
      <CompactRootPanel controls={controls} search={search} />
    </ControlPanelPopover>
  );
}

/**
 * The fold's first page. A component of its own because it calls
 * `usePanelStack()`, which only exists inside the stack the popover mounts.
 */
function CompactRootPanel({
  controls,
  search,
}: {
  controls: DataViewControl[];
  search?: ReactNode;
}): ReactNode {
  const ctx = useDataViewControls();
  const { push } = usePanelStack();

  return (
    <>
      {search ? <ControlPanel.Section>{search}</ControlPanel.Section> : null}
      <ControlPanel.Section>
        {controls.map((control) => {
          // The same pure `summary` the wide bar's trigger reads — so a folded
          // control says exactly what its unfolded twin would say.
          const summary = control.summary?.(ctx) ?? null;
          return (
            <ControlPanel.Row
              key={control.id}
              icon={<control.icon />}
              trailing={
                summary
                  ? summary.more
                    ? `${summary.label} +${summary.more}`
                    : summary.label
                  : undefined
              }
              onSelect={() =>
                push({
                  key: control.id,
                  title: control.label,
                  render: () => <DataViewControlPanel control={control} />,
                })
              }
            >
              {control.label}
            </ControlPanel.Row>
          );
        })}
      </ControlPanel.Section>
    </>
  );
}

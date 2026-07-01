/**
 * ViewOptionsToggle — the shared display-options popover button, contributed to
 * the `Sonata.Hud` cluster so it appears in EVERY display lens (piano roll,
 * notation, songsheet) rather than being mounted by one display.
 *
 * Lists every `Sonata.ViewOption` contribution: each hands a config_v2
 * descriptor (optionally a `fields` subset), and the host renders those fields
 * generically through the shared `FieldRenderer` — the same control the Settings
 * config pane uses. Collection-consumer clean: only generic slot fields are
 * read, so any plugin surfacing a new display option auto-appears here with zero
 * edits.
 *
 * Each contribution is its own component (`ViewOptionGroup`) so the per-config
 * `useConfig`/`useSetConfig` hooks stay stable per component — the contribution
 * list length never changes a component's hook count.
 *
 * The trigger is a ToggleChip styled to match the HUD chip aesthetic (the
 * key-chip pill: translucent background + backdrop blur). The HUD cluster is
 * pointer-events-none, so the wrapper re-enables pointer events locally.
 */
import { useState } from "react";
import { MdTune } from "react-icons/md";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { FieldRenderer } from "@plugins/config_v2/plugins/fields/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";

type ViewOptionItem = ReturnType<typeof Sonata.ViewOption.useContributions>[number];

export function ViewOptionsToggle() {
  const options = Sonata.ViewOption.useContributions();
  const { activeDisplayId } = useSonata();
  const [open, setOpen] = useState(false);

  // Scope options to the active lens: show only the current display's options
  // plus globals, so e.g. Notation never surfaces piano-roll-only key controls.
  const visible = options.filter(
    (o) =>
      o.displays === "global" ||
      (activeDisplayId != null && o.displays.includes(activeDisplayId)),
  );
  if (visible.length === 0) return null;

  return (
    // The HUD may sit INSIDE a display's drag-to-scrub surface (e.g. the piano
    // roll), whose pointerdown handler takes pointer capture (useInertialDrag) —
    // capture retargets the gesture to the lane and suppresses the button's
    // `click`, so the popover would never open (and a press would grab the
    // scrubber). The shared HUD cluster is also pointer-events-none. Re-enable
    // pointer events and stop pointerdown here so a press on the button is a
    // button press, not a drag.
    <div
      className="pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <InlinePopover
        open={open}
        onOpenChange={setOpen}
        align="end"
        side="bottom"
        tooltip="Display options"
        width="sm"
        padding="sm"
        trigger={
          <ToggleChip
            active={open}
            icon={<MdTune />}
            aria-label="Display options"
            className={cn(
              // Match the HUD pill look (key-chip): translucent + blurred.
              !open && "bg-background/90 shadow-sm backdrop-blur-sm",
            )}
          >
            View
          </ToggleChip>
        }
      >
        <Stack gap="2xs">
          {visible.map((o) => (
            <ViewOptionGroup key={o.id} option={o} />
          ))}
        </Stack>
      </InlinePopover>
    </div>
  );
}

function ViewOptionGroup({ option }: { option: ViewOptionItem }) {
  const values = useConfig(option.config) as Record<string, unknown>;
  const setConfig = useSetConfig(option.config);
  const keys = option.fields ?? Object.keys(option.config.fields);

  return (
    <>
      {keys.map((key) => {
        const field = option.config.fields[key];
        if (!field) return null;
        return (
          <FieldRenderer
            key={key}
            field={field}
            value={values[key]}
            onChange={(v) => setConfig(key, v)}
          />
        );
      })}
    </>
  );
}

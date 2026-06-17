/**
 * FxToggle — the host-owned FX popover button in the lane's HUD cluster.
 *
 * Lists every PianoRollFx contribution grouped by tier ("Ambient" first —
 * the always-tasteful defaults — then the opt-in "Fancy" spectacle), each row
 * a label + icon + switch wired to the effect's own `{ enabled }` config via
 * useConfig/useSetConfig. Collection-consumer clean: only generic slot fields
 * are read, so every new fx plugin auto-appears here with zero edits.
 *
 * Each row is its own component so the config hooks stay stable per component
 * (the contribution list length never changes a component's hook count).
 *
 * The trigger is a ToggleChip styled to match the HUD chip aesthetic (the
 * key-chip pill: translucent background + backdrop blur). The HUD cluster is
 * pointer-events-none, so the wrapper re-enables pointer events locally.
 */
import { useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { PianoRollFx } from "../slots";

type FxItem = ReturnType<typeof PianoRollFx.useContributions>[number];

export function FxToggle() {
  const effects = PianoRollFx.useContributions();
  const [open, setOpen] = useState(false);
  if (effects.length === 0) return null;

  const ambient = effects.filter((e) => e.tier === "ambient");
  const fancy = effects.filter((e) => e.tier === "fancy");

  return (
    // The HUD sits INSIDE the lane's drag-to-scrub surface, whose pointerdown
    // handler takes pointer capture (useInertialDrag) — capture retargets the
    // gesture to the lane and suppresses the button's `click`, so the popover
    // would never open (and a press would grab the scrubber). Stop pointer
    // events here so a press on the FX button is a button press, not a drag.
    <div
      className="pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <InlinePopover
        open={open}
        onOpenChange={setOpen}
        align="end"
        side="bottom"
        tooltip="Visual effects"
        contentClassName="w-60 p-sm"
        trigger={
          <ToggleChip
            active={open}
            size="sm"
            icon={<MdAutoAwesome />}
            aria-label="Visual effects"
            className={cn(
              // Match the HUD pill look (key-chip): translucent + blurred.
              !open && "bg-background/90 shadow-sm backdrop-blur-sm",
            )}
          >
            FX
          </ToggleChip>
        }
      >
        <Stack gap="sm">
          {ambient.length > 0 ? <FxTierSection label="Ambient" effects={ambient} /> : null}
          {fancy.length > 0 ? <FxTierSection label="Fancy" effects={fancy} /> : null}
        </Stack>
      </InlinePopover>
    </div>
  );
}

function FxTierSection({ label, effects }: { label: string; effects: FxItem[] }) {
  return (
    <Stack gap="2xs">
      <SectionLabel className="p-xs">{label}</SectionLabel>
      {effects.map((e) => (
        <FxToggleRow key={e.id} effect={e} />
      ))}
    </Stack>
  );
}

function FxToggleRow({ effect }: { effect: FxItem }) {
  const { enabled } = useConfig(effect.config);
  const setConfig = useSetConfig(effect.config);
  const Icon = effect.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setConfig("enabled", !enabled)}
      className="flex w-full items-center gap-sm rounded-sm p-xs text-left transition-colors hover:bg-muted"
    >
      {Icon ? <Icon className="icon-auto shrink-0 text-muted-foreground" /> : null}
      <Text variant="body" className="min-w-0 flex-1 truncate">
        {effect.label}
      </Text>
      {/* Switch visual — the whole row is the actual control (role="switch"). */}
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          enabled ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-3 rounded-full bg-background shadow-sm transition-transform",
            enabled && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}

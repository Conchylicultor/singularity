import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { ConfigGearButton } from "./config-gear-button";

export interface ConfigMenuHeaderProps {
  label?: string;
  descriptor: ConfigDescriptor;
}

// The menu twin of ConfigPopoverHeader: a header row for a config-backed
// Select / DropdownMenu, with an optional eyebrow label and a trailing gear that
// jumps to the backing config. Lives inside the menu chrome so the "configure"
// affordance can't be forgotten. The Frame trailing slot pins the gear right
// even when there is no label.
export function ConfigMenuHeader({ label, descriptor }: ConfigMenuHeaderProps) {
  return (
    <Frame
      gap="sm"
      content={label ? <SectionLabel>{label}</SectionLabel> : undefined}
      trailing={
        <ConfigGearButton
          descriptor={descriptor}
          label={label ? `Configure: ${label}` : undefined}
        />
      }
    />
  );
}

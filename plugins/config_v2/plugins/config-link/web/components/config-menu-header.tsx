import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { ConfigGearButton } from "./config-gear-button";

export interface ConfigMenuHeaderProps {
  label?: string;
  descriptor: ConfigDescriptor;
}

// The menu twin of ConfigPopoverHeader: a header row for a config-backed
// Select / DropdownMenu, with an optional eyebrow label and a trailing gear that
// jumps to the backing config. Lives inside the menu chrome so the "configure"
// affordance can't be forgotten. The flexible spacer cell absorbs the row slack
// so the gear stays pinned right even when there is no label.
export function ConfigMenuHeader({ label, descriptor }: ConfigMenuHeaderProps) {
  return (
    <div className="flex items-center gap-sm">
      <div className="min-w-0 flex-1">
        {label ? <SectionLabel>{label}</SectionLabel> : null}
      </div>
      <div className="flex shrink-0 items-center gap-sm">
        <ConfigGearButton
          descriptor={descriptor}
          label={label ? `Configure: ${label}` : undefined}
        />
      </div>
    </div>
  );
}

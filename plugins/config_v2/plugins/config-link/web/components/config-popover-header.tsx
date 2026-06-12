import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { ConfigGearButton } from "./config-gear-button";

export interface ConfigPopoverHeaderProps {
  label: string;
  descriptor: ConfigDescriptor;
}

// The standard header for a config-backed popover: an eyebrow label plus a
// trailing gear that jumps to the backing config. Swap a bare <SectionLabel>
// for this and the "configure" affordance comes for free — the convention for
// any chip/popover whose contents are driven by config_v2.
export function ConfigPopoverHeader({ label, descriptor }: ConfigPopoverHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-sm pl-xs pr-2xs">
      <SectionLabel className="py-xs text-3xs">{label}</SectionLabel>
      <ConfigGearButton descriptor={descriptor} label={`Configure: ${label}`} />
    </div>
  );
}

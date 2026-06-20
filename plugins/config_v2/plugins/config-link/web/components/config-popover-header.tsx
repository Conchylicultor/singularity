import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
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
    <Frame
      className="pl-xs pr-2xs"
      content={<SectionLabel className="py-xs text-3xs">{label}</SectionLabel>}
      trailing={<ConfigGearButton descriptor={descriptor} label={`Configure: ${label}`} />}
    />
  );
}

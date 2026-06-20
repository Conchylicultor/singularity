import { MdSettings } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { useOpenConfig } from "../internal/use-open-config";

export interface ConfigGearButtonProps {
  descriptor: ConfigDescriptor;
  label?: string;
}

// Reusable "configure this" affordance: a compact gear that opens the given
// config descriptor's settings section. Drop in next to any surface backed by
// config_v2 (chips, popover headers, expanded panels).
export function ConfigGearButton({ descriptor, label }: ConfigGearButtonProps) {
  const openConfig = useOpenConfig();
  return (
    <ControlSizeProvider size="sm">
      <IconButton
        icon={MdSettings}
        label={label ?? "Open settings"}
        onClick={(e) => {
          e.stopPropagation();
          openConfig(descriptor);
        }}
      />
    </ControlSizeProvider>
  );
}

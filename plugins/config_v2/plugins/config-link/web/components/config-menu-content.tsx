import type * as React from "react";
import { DropdownMenuContent } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { ConfigMenuHeader } from "./config-menu-header";

export type ConfigMenuContentProps = React.ComponentProps<typeof DropdownMenuContent> & {
  descriptor: ConfigDescriptor;
  label?: string;
};

// DropdownMenuContent pre-wired with a config gear in its menu header: every
// DropdownMenu whose items come from `descriptor` gets a one-click jump to its
// settings, guaranteed. Drop-in replacement for <DropdownMenuContent> on
// config-backed pickers.
export function ConfigMenuContent({
  descriptor,
  label,
  children,
  ...rest
}: ConfigMenuContentProps) {
  return (
    <DropdownMenuContent header={<ConfigMenuHeader label={label} descriptor={descriptor} />} {...rest}>
      {children}
    </DropdownMenuContent>
  );
}

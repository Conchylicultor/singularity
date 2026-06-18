import type * as React from "react";
import { SelectContent } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { ConfigMenuHeader } from "./config-menu-header";

export type ConfigSelectContentProps = React.ComponentProps<typeof SelectContent> & {
  descriptor: ConfigDescriptor;
  label?: string;
};

// SelectContent pre-wired with a config gear in its menu header: every Select
// whose options come from `descriptor` gets a one-click jump to its settings,
// guaranteed. Drop-in replacement for <SelectContent> on config-backed pickers.
export function ConfigSelectContent({
  descriptor,
  label,
  children,
  ...rest
}: ConfigSelectContentProps) {
  return (
    <SelectContent header={<ConfigMenuHeader label={label} descriptor={descriptor} />} {...rest}>
      {children}
    </SelectContent>
  );
}

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const refreshIcon = symbol("refresh");

export interface SpinnerProps {
  spinning?: boolean;
  className?: string;
}

export function Spinner({ spinning = true, className }: SpinnerProps) {
  return (
    <Icon
      icon={refreshIcon}
      className={cn(spinning && "animate-spin", className)}
    />
  );
}

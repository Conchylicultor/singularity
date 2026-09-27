import { Icon } from "@plugins/ui/plugins/icons/web";
import type { AppIcon } from "../../core";

export function AppIconView({
  icon,
  active,
  className,
}: {
  icon: AppIcon;
  /** The app is the focused one: its glyph in the theme's active fill. */
  active?: boolean;
  className?: string;
}) {
  switch (icon.kind) {
    case "symbol":
      return <Icon icon={icon.symbol} active={active} className={className} />;
  }
}

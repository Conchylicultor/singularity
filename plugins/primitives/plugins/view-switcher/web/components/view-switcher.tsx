import { Icon } from "@plugins/ui/plugins/icons/web";
import type { IconRef } from "@plugins/ui/plugins/icons/core";
import type { ReactNode } from "react";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

export interface ViewSwitcherOption {
  id: string;
  title: string;
  icon: IconRef;
}

export interface ViewSwitcherProps {
  options: readonly ViewSwitcherOption[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * Presentational view-switcher chrome: borderless ghost pills (the Notion look),
 * built on `SegmentedControl variant="ghost"`. Pure chrome — no localStorage, no
 * slots, no config; selection state stays with the caller. Renders nothing when
 * there is one option or fewer.
 */
export function ViewSwitcher({
  options,
  activeId,
  onSelect,
  className,
}: ViewSwitcherProps): ReactNode {
  if (options.length <= 1) return null;

  return (
    <SegmentedControl
      options={options.map((opt) => ({
        id: opt.id,
        label: opt.title,
        icon: (
          <Icon
            icon={opt.icon}
            active={opt.id === activeId}
            className="size-3.5"
          />
        ),
        title: opt.title,
      }))}
      value={activeId}
      onChange={onSelect}
      variant="ghost"
      className={className}
    />
  );
}

import type { ComponentType, ReactNode } from "react";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

export interface ViewSwitcherOption {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
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
      options={options.map((opt) => {
        const Icon = opt.icon;
        return {
          id: opt.id,
          label: opt.title,
          icon: <Icon className="size-3.5" />,
          title: opt.title,
        };
      })}
      value={activeId}
      onChange={onSelect}
      variant="ghost"
      className={className}
    />
  );
}

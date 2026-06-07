import type { ReactNode } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import type { DataViewContribution } from "../slots";

export interface ViewSwitcherProps {
  views: SealContributions<DataViewContribution>[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ViewSwitcher({
  views,
  activeId,
  onSelect,
}: ViewSwitcherProps): ReactNode {
  if (views.length <= 1) return null;

  return (
    <SegmentedControl
      options={views.map((v) => {
        const Icon = v.icon;
        return {
          id: v.id,
          label: v.title,
          icon: <Icon className="size-3.5" />,
          title: v.title,
        };
      })}
      value={activeId}
      onChange={onSelect}
      variant="ghost"
      size="sm"
    />
  );
}

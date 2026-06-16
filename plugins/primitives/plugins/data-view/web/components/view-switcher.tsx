import type { ReactNode } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { ViewSwitcher as ViewSwitcherChrome } from "@plugins/primitives/plugins/view-switcher/web";
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
  return (
    <ViewSwitcherChrome
      options={views.map((v) => ({ id: v.id, title: v.title, icon: v.icon }))}
      activeId={activeId}
      onSelect={onSelect}
    />
  );
}

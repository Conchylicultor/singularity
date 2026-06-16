import type { ReactNode } from "react";
import { ViewSwitcher as ViewSwitcherChrome } from "@plugins/primitives/plugins/view-switcher/web";
import type { ResolvedViewInstance } from "../internal/resolve-instances";

export interface ViewSwitcherProps {
  instances: ResolvedViewInstance[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ViewSwitcher({
  instances,
  activeId,
  onSelect,
}: ViewSwitcherProps): ReactNode {
  return (
    <ViewSwitcherChrome
      options={instances.map((r) => ({
        id: r.instance.id,
        title: r.instance.name,
        icon: r.viewType.icon,
      }))}
      activeId={activeId}
      onSelect={onSelect}
    />
  );
}

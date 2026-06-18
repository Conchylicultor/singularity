import { type ComponentType, type ReactNode, useMemo, useState } from "react";
import { defineSlot, type Slot } from "@plugins/framework/plugins/web-sdk/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { ViewSwitcher } from "@plugins/primitives/plugins/view-switcher/web";

export interface TabContribution<ViewProps> {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  order?: number;
  component: ComponentType<ViewProps>;
}

export interface TabbedView<ViewProps> {
  View: Slot<TabContribution<ViewProps>>;
  Host: ComponentType<ViewProps & { header?: ReactNode; className?: string }>;
}

export function defineTabbedView<ViewProps extends object>(
  id: string,
): TabbedView<ViewProps> {
  const storageKey = `${id}:active-view`;

  const View = defineSlot<TabContribution<ViewProps>>(`${id}.view`, {
    docLabel: (p) => p.title,
  });

  function Host(props: ViewProps & { header?: ReactNode; className?: string }): ReactNode {
    const { header, className, ...viewProps } = props;
    const views = View.useContributions();

    const ordered = useMemo(
      () => [...views].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      [views],
    );

    const [activeViewId, setActiveViewId] = useState<string | null>(() => {
      try {
        return localStorage.getItem(storageKey);
      } catch (err) {
        if (!(err instanceof DOMException)) throw err;
        return null;
      }
    });

    const activeView =
      ordered.find((v) => v.id === activeViewId) ?? ordered[0] ?? null;

    const selectView = (viewId: string) => {
      setActiveViewId(viewId);
      try {
        localStorage.setItem(storageKey, viewId);
      } catch (err) {
        if (!(err instanceof DOMException)) throw err;
      }
    };

    return (
      <Column
        fill
        className={className}
        header={
          header != null || ordered.length > 1 ? (
            <Stack gap="xs" className="px-sm pb-xs">
              {header}
              {ordered.length > 1 && activeView && (
                <ViewSwitcher
                  options={ordered.map((v) => ({
                    id: v.id,
                    title: v.title,
                    icon: v.icon,
                  }))}
                  activeId={activeView.id}
                  onSelect={selectView}
                />
              )}
            </Stack>
          ) : undefined
        }
        scrollBody={false}
        body={
          <Scroll fill hideScrollbar>
            {activeView &&
              renderIsolated(
                View.id,
                activeView as unknown as Contribution,
                viewProps as ViewProps,
              )}
          </Scroll>
        }
      />
    );
  }

  return { View, Host };
}

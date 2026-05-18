import { type ComponentType, type ReactNode, useMemo, useState } from "react";
import { defineSlot, type Slot } from "@plugins/framework/plugins/web-sdk/core";
import { cn } from "@/lib/utils";

export interface TabContribution<ViewProps> {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  order?: number;
  component: ComponentType<ViewProps>;
}

export interface TabbedView<ViewProps> {
  View: Slot<TabContribution<ViewProps>>;
  Host: ComponentType<ViewProps & { header?: ReactNode }>;
}

export function defineTabbedView<ViewProps extends object>(
  id: string,
): TabbedView<ViewProps> {
  const storageKey = `${id}:active-view`;

  const View = defineSlot<TabContribution<ViewProps>>(`${id}.view`, {
    docLabel: (p) => p.title,
  });

  function Host(props: ViewProps & { header?: ReactNode }): ReactNode {
    const { header, ...viewProps } = props;
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

    const ActiveComponent = activeView?.component ?? null;

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {(header || ordered.length > 1) && (
          <div className="flex shrink-0 flex-col gap-1 px-2 pb-1">
            {header}
            {ordered.length > 1 && (
              <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                {ordered.map((v) => {
                  const Icon = v.icon;
                  const selected = activeView?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectView(v.id)}
                      aria-pressed={selected}
                      title={v.title}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-sm px-2 py-1 text-xs",
                        selected
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      <Icon className="size-3.5" />
                      <span>{v.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {ActiveComponent && (
            <ActiveComponent {...(viewProps as ViewProps)} />
          )}
        </div>
      </div>
    );
  }

  return { View, Host };
}

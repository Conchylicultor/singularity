import type { ComponentType, ReactNode } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  defineRenderSlot,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";

export interface DetailSectionsOptions {
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export interface DetailSections<EntityProps> {
  Section: RenderSlot<{
    label: string;
    component: ComponentType<EntityProps>;
    headerExtra?: ComponentType;
  }>;
  Host: ComponentType<EntityProps>;
}

export function defineDetailSections<EntityProps extends Record<string, unknown>>(
  id: string,
  options?: DetailSectionsOptions,
): DetailSections<EntityProps> {
  const Section = defineRenderSlot<{
    label: string;
    component: ComponentType<EntityProps>;
    headerExtra?: ComponentType;
  }>(`${id}.section`, {
    docLabel: (p) => p.id,
  });

  function Host(entityProps: EntityProps): ReactNode {
    if (options?.collapsible) {
      return (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <Section.Render>
            {(item) => {
              const C = item.component;
              return (
                <Collapsible defaultOpen={options.defaultOpen ?? false}>
                  <div className="rounded-lg border border-border/60">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/30 rounded-lg">
                      <CollapsibleChevron className="size-3.5 text-muted-foreground" />
                      {item.label}
                      {(() => {
                        const Extra = item.headerExtra;
                        return Extra ? (
                          <span className="ml-auto flex items-center">
                            <Extra />
                          </span>
                        ) : null;
                      })()}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <C {...entityProps} />
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            }}
          </Section.Render>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6 p-6">
        <Section.Render>
          {(item) => {
            const C = item.component;
            return <C {...entityProps} />;
          }}
        </Section.Render>
      </div>
    );
  }

  return { Section, Host };
}

import type { ComponentType, ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/row/web";
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
    summary?: ComponentType<EntityProps>;
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
    summary?: ComponentType<EntityProps>;
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
                    {(() => {
                      const Extra = item.headerExtra;
                      return (
                        <SectionHeaderRow
                          variant="title"
                          className="rounded-lg px-4 py-3"
                          actions={Extra ? <Extra /> : undefined}
                        >
                          {item.label}
                        </SectionHeaderRow>
                      );
                    })()}
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

import type { ComponentType, ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
        <Stack gap="sm" className="px-lg pb-lg">
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
                          className="rounded-lg px-lg py-md"
                          actions={Extra ? <Extra /> : undefined}
                        >
                          {item.label}
                        </SectionHeaderRow>
                      );
                    })()}
                    <CollapsibleContent className="px-lg pb-lg pane-gutter-flush">
                      <C {...entityProps} />
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            }}
          </Section.Render>
        </Stack>
      );
    }
    return (
      // Detail sections provide their own inset, so any embedded DataView's pane
      // gutter is declared spent (generic — no per-consumer opt-out needed).
      <Stack gap="xl" className="p-xl pane-gutter-flush">
        <Section.Render>
          {(item) => {
            const C = item.component;
            return <C {...entityProps} />;
          }}
        </Section.Render>
      </Stack>
    );
  }

  return { Section, Host };
}

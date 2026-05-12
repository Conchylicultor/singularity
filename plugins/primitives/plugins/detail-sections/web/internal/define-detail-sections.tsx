import type { ComponentType, ReactNode } from "react";
import {
  defineRenderSlot,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";

export interface DetailSections<EntityProps> {
  Section: RenderSlot<{
    label: string;
    component: ComponentType<EntityProps>;
  }>;
  Host: ComponentType<EntityProps>;
}

export function defineDetailSections<EntityProps extends Record<string, unknown>>(
  id: string,
): DetailSections<EntityProps> {
  const Section = defineRenderSlot<{
    label: string;
    component: ComponentType<EntityProps>;
  }>(`${id}.section`, {
    docLabel: (p) => p.id,
  });

  function Host(entityProps: EntityProps): ReactNode {
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

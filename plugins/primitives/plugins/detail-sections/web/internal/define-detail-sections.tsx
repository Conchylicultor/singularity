import type { ComponentType, ReactNode } from "react";
import { defineSlot } from "@core";
import {
  Reorder,
  type ReorderableSlot,
} from "@plugins/reorder/web";

export interface DetailSections<EntityProps> {
  Section: ReorderableSlot<{
    id: string;
    label: string;
    component: ComponentType<EntityProps>;
  }>;
  Host: ComponentType<EntityProps>;
}

export function defineDetailSections<EntityProps extends Record<string, unknown>>(
  id: string,
): DetailSections<EntityProps> {
  const rawSlot = defineSlot<{
    id: string;
    label: string;
    component: ComponentType<EntityProps>;
  }>(`${id}.section`, { docLabel: (p) => p.id });

  const Section = Reorder.area(rawSlot, {
    getLabel: (c) => c.label,
  });

  function Host(entityProps: EntityProps): ReactNode {
    const { items, DndWrapper, ReorderItem } = Reorder.useArea(Section);
    return (
      <DndWrapper>
        <div className="flex flex-col gap-6 p-6">
          {items.map((item) => {
            const C = item.component;
            return (
              <ReorderItem key={item.id} item={item}>
                <C {...entityProps} />
              </ReorderItem>
            );
          })}
        </div>
      </DndWrapper>
    );
  }

  return { Section, Host };
}

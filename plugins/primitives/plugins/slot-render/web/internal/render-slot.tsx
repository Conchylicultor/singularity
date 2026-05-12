import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import { defineSlot, PluginRuntimeContext, type Slot } from "@core";
import type { Contribution } from "@core";
import type { ReorderConfig } from "./types";
import {
  getSlotItemMiddlewares,
  getSlotListMiddlewares,
  registerRenderSlotConfig,
} from "./registry";

export interface RenderSlotConfig<P> {
  reorder?: ReorderConfig<P & { id: string }>;
  docLabel?: (props: P & { id: string }) => string | undefined;
}

interface RenderProps<P> {
  children?: (item: P) => ReactNode;
  subId?: string;
}

export interface RenderSlot<P> extends Slot<P & { id: string }> {
  Render: ComponentType<RenderProps<P & { id: string }>>;
  readonly reorderConfig: ReorderConfig<P & { id: string }>;
}

export const RenderSlotSubIdContext = createContext<string | undefined>(
  undefined,
);

export function defineRenderSlot<P>(
  id: string,
  config?: RenderSlotConfig<P>,
): RenderSlot<P> {
  const slot = defineSlot<P & { id: string }>(id, {
    docLabel: config?.docLabel,
  });

  const renderSlot = slot as unknown as RenderSlot<P>;
  (renderSlot as { reorderConfig: ReorderConfig<P & { id: string }> }).reorderConfig =
    config?.reorder ?? {};
  registerRenderSlotConfig(
    id,
    renderSlot.reorderConfig as ReorderConfig<unknown>,
  );

  renderSlot.Render = function SlotRender({
    children,
    subId,
  }: RenderProps<P & { id: string }>) {
    const ctx = useContext(PluginRuntimeContext);
    if (!ctx) {
      throw new Error("SlotRender must be used within PluginProvider");
    }

    const rawContributions = ctx.bySlot.get(id) ?? [];
    const cleanItems = slot.useContributions();

    const cleanById = useMemo(
      () => new Map(cleanItems.map((item) => [item.id, item])),
      [cleanItems],
    );

    const renderItem = useCallback(
      (contribution: Contribution): ReactNode => {
        const cId = contribution.id as string | undefined;
        if (!cId) return null;
        const clean = cleanById.get(cId);
        if (!clean) return null;

        let node: ReactNode = children
          ? children(clean)
          : "component" in clean &&
              typeof clean.component === "function"
            ? ((C: ComponentType) => <C />)(
                clean.component as ComponentType,
              )
            : null;

        const itemMws = getSlotItemMiddlewares();
        for (let i = itemMws.length - 1; i >= 0; i--) {
          const Mw = itemMws[i]!.Component;
          const captured = node;
          node = (
            <Mw slotId={id} contribution={contribution}>
              {captured}
            </Mw>
          );
        }

        return <Fragment key={cId}>{node}</Fragment>;
      },
      [cleanById, children],
    );

    const listMws = getSlotListMiddlewares();
    const defaultRendering = (
      <>{rawContributions.map((c) => renderItem(c))}</>
    );

    let result: ReactNode = defaultRendering;
    for (let i = listMws.length - 1; i >= 0; i--) {
      const Mw = listMws[i]!.Component;
      const captured = result;
      result = (
        <Mw
          slotId={id}
          contributions={rawContributions}
          renderItem={renderItem}
        >
          {captured}
        </Mw>
      );
    }

    if (subId !== undefined) {
      return (
        <RenderSlotSubIdContext.Provider value={subId}>
          {result}
        </RenderSlotSubIdContext.Provider>
      );
    }

    return result;
  };

  return renderSlot;
}

import {
  createElement,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  defineSlot,
  PluginRuntimeContext,
  UNSAFE_unsealSlotComponent,
  type Slot,
  type SealedComponent,
} from "@plugins/framework/plugins/web-sdk/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import {
  getSlotItemMiddlewares,
  getSlotListMiddlewares,
} from "./registry";

export interface RenderSlotConfig<P> {
  docLabel?: (props: P & { id: string }) => string | undefined;
  /**
   * When `false`, `.Render` applies item middlewares (error-boundary isolation)
   * but skips list middlewares, so contributions are isolated but not
   * draggable/reorderable. Defaults to `true`.
   */
  reorder?: boolean;
}

/**
 * Wraps a rendered node in the registered item middlewares (error-boundary
 * isolation, reorder item handle, …). Shared by `.Render` and `.Dispatch`.
 */
export function applyItemMiddlewares(
  node: ReactNode,
  slotId: string,
  contribution: Contribution,
): ReactNode {
  const itemMws = getSlotItemMiddlewares();
  for (let i = itemMws.length - 1; i >= 0; i--) {
    const Mw = itemMws[i]!.Component;
    const captured = node;
    node = (
      <Mw slotId={slotId} contribution={contribution}>
        {captured}
      </Mw>
    );
  }
  return node;
}

interface RenderProps<P> {
  children?: (item: P) => ReactNode;
  subId?: string;
}

export interface RenderSlot<P>
  extends Slot<P & { id: string; excludeFromReorder?: boolean; reorderWrapperClassName?: string }> {
  Render: ComponentType<
    RenderProps<P & { id: string; excludeFromReorder?: boolean; reorderWrapperClassName?: string }>
  >;
}

import { createContext } from "react";
export const RenderSlotSubIdContext = createContext<string | undefined>(
  undefined,
);

export function defineRenderSlot<P>(
  id: string,
  config?: RenderSlotConfig<P>,
): RenderSlot<P> {
  const slot = defineSlot<P & { id: string; excludeFromReorder?: boolean; reorderWrapperClassName?: string }>(
    id,
    { docLabel: config?.docLabel },
  );

  const renderSlot = slot as unknown as RenderSlot<P>;
  const reorder = config?.reorder ?? true;

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
        const clean = cleanById.get(cId as (P & { id: string })["id"]);
        if (!clean) return null;

        const node: ReactNode = children
          ? children(clean as unknown as P & { id: string })
          : "component" in clean &&
              typeof clean.component === "function"
            ? ((C: ComponentType) => <C />)(
                UNSAFE_unsealSlotComponent(
                  clean.component as unknown as SealedComponent,
                ),
              )
            : null;

        return (
          <Fragment key={cId}>
            {applyItemMiddlewares(node, id, contribution)}
          </Fragment>
        );
      },
      [cleanById, children],
    );

    const defaultRendering = (
      <>{rawContributions.map((c) => renderItem(c))}</>
    );

    let result: ReactNode = defaultRendering;
    if (reorder) {
      const listMws = getSlotListMiddlewares();
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

export interface DispatchContribution<Props, Key extends string> {
  /**
   * Plain string = exact match; RegExp = pattern match; predicate = arbitrary
   * test against the render props. Precedence: exact string → RegExp →
   * predicate (in registration order).
   */
  match: Key | RegExp | ((props: Props) => boolean);
  component: ComponentType<Props>;
}

export interface DispatchSlotConfig<Props, Key extends string, Extra extends object> {
  /** Project the dispatch key out of the render props. */
  key: (props: Props) => Key;
  /** Rendered (and isolated) when nothing matches. */
  fallback?: ComponentType<Props>;
  docLabel?: (
    c: DispatchContribution<Props, Key> & Extra,
  ) => string | undefined;
}

export interface DispatchSlot<Props, Key extends string = string, Extra extends object = {}>
  extends Slot<DispatchContribution<Props, Key> & Extra> {
  Dispatch: ComponentType<Props>;
}

export function defineDispatchSlot<
  Props,
  Key extends string = string,
  Extra extends object = {},
>(
  id: string,
  config: DispatchSlotConfig<Props, Key, Extra>,
): DispatchSlot<Props, Key, Extra> {
  const slot = defineSlot<DispatchContribution<Props, Key> & Extra>(id, {
    docLabel: config.docLabel ? (c) => config.docLabel!(c) : undefined,
  });

  const dispatchSlot = slot as unknown as DispatchSlot<Props, Key, Extra>;

  dispatchSlot.Dispatch = function SlotDispatch(props: Props) {
    const ctx = useContext(PluginRuntimeContext);
    if (!ctx) {
      throw new Error("SlotDispatch must be used within PluginProvider");
    }

    const rawContributions = ctx.bySlot.get(id) ?? [];
    const cleanItems = slot.useContributions();

    const key = config.key(props);

    // Precedence: exact string → RegExp → predicate (registration order).
    let matchedIndex = cleanItems.findIndex(
      (c) => typeof c.match === "string" && c.match === key,
    );
    if (matchedIndex < 0) {
      matchedIndex = cleanItems.findIndex(
        (c) => c.match instanceof RegExp && c.match.test(key),
      );
    }
    if (matchedIndex < 0) {
      matchedIndex = cleanItems.findIndex(
        (c) => typeof c.match === "function" && c.match(props),
      );
    }

    const matched = matchedIndex >= 0 ? cleanItems[matchedIndex] : undefined;
    const Component = matched
      ? UNSAFE_unsealSlotComponent(matched.component as SealedComponent<Props>)
      : config.fallback;
    // Index correspondence: both `cleanItems` and `rawContributions` come from
    // `ctx.bySlot.get(id)` (clean is a positional `.map` of raw — slots.ts:33-36),
    // so `rawContributions[matchedIndex]` is the stamped Contribution carrying
    // `_pluginName` for the error-boundary middleware. The fallback path has no
    // contribution, so synthesize a minimal one with a generic boundary label.
    const contribution: Contribution =
      matchedIndex >= 0
        ? rawContributions[matchedIndex]!
        : ({ _slotId: id } as Contribution);

    const node: ReactNode = Component
      ? createElement(Component as ComponentType<object>, props as object)
      : null;
    return applyItemMiddlewares(node, id, contribution);
  };

  return dispatchSlot;
}

/**
 * Render one contribution's component wrapped in the registered item middlewares
 * (error-boundary isolation). For bespoke selection that `.Render`/`.Dispatch`
 * can't express (e.g. a tiered `supports()` probe). STILL ISOLATED — not an
 * escape from isolation.
 */
export function renderIsolated(
  slotId: string,
  contribution: Contribution,
  props?: object,
): ReactNode {
  const Component = UNSAFE_unsealSlotComponent(
    (contribution as unknown as { component: SealedComponent }).component,
  );
  return applyItemMiddlewares(
    createElement(Component as ComponentType<object>, props),
    slotId,
    contribution,
  );
}

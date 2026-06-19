import { type ControlSize, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import {
  createElement,
  Fragment,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
   * Declares this slot size-owning: `.Render` wraps every contribution in a
   * `ControlSizeProvider` of this density, so each contributed control inherits
   * one height (text → `control-sm`, icon → `control-icon-sm`, chip → its `sm`)
   * instead of declaring its own `size`. This is how a toolbar enforces a
   * consistent size across opaque contributions — declaring it here IS the
   * enforcement; a host cannot forget. Items should omit `size`; an explicit
   * `size` on a contribution still wins (escape hatch).
   */
  controlSize?: ControlSize;
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

/**
 * Per-contribution render path shared by `.Render` (its default, non-`children`
 * branch) and `.Mount`: unseal the clean contribution's `component`, render it
 * as `<C/>`, and wrap in the item middlewares (error-boundary isolation). The
 * caller supplies the matched clean item and its raw stamped contribution.
 * Returns `null` when the clean item has no callable `component`.
 */
function renderContributionIsolated(
  clean: unknown,
  contribution: Contribution,
  slotId: string,
): ReactNode {
  const component = (clean as { component?: unknown }).component;
  const node: ReactNode =
    typeof component === "function"
      ? ((C: ComponentType) => <C />)(
          UNSAFE_unsealSlotComponent(component as unknown as SealedComponent),
        )
      : null;
  return applyItemMiddlewares(node, slotId, contribution);
}

interface RenderProps<P> {
  children?: (item: P) => ReactNode;
  subId?: string;
}

export interface RenderSlot<P>
  extends Slot<P & { id: string; excludeFromReorder?: boolean; reorderFill?: boolean }> {
  Render: ComponentType<
    RenderProps<P & { id: string; excludeFromReorder?: boolean; reorderFill?: boolean }>
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
  const slot = defineSlot<P & { id: string; excludeFromReorder?: boolean; reorderFill?: boolean }>(
    id,
    { docLabel: config?.docLabel },
  );

  const renderSlot = slot as unknown as RenderSlot<P>;
  const controlSize = config?.controlSize;

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

    // Single-line discipline at the slot boundary: when the slot lays out
    // horizontally, every contribution is wrapped in a `min-w-0` cell so the
    // flex shrink-chain is never broken above a contribution. Without this,
    // each contributor would have to remember `min-w-0` on its own root or its
    // text silently wraps when the row is compressed. Fixed-size controls (the
    // `Button` primitive is `shrink-0`) are unaffected; flexible text shrinks
    // and truncates. Vertical lists are left untouched (zero layout change).
    // Orientation is read from the container at runtime — same sentinel
    // technique as the reorder list middleware — so slots declare nothing.
    const sentinelRef = useRef<HTMLSpanElement>(null);
    const [horizontal, setHorizontal] = useState(false);
    useLayoutEffect(() => {
      const parent = sentinelRef.current?.parentElement;
      if (!parent) return;
      // `flex-direction`'s computed value is `row` for EVERY element — it's the
      // CSS initial value, reported regardless of `display`. So a plain block or
      // grid host reports `row` and would be wrongly treated as horizontal,
      // wrapping each contribution in a `min-w-0` cell that collapses wide
      // block-level content to its min-content width. Gate on the parent being
      // an actual flex container first; non-flex hosts fall through to the
      // untouched vertical path.
      const style = getComputedStyle(parent);
      const isFlex = style.display === "flex" || style.display === "inline-flex";
      const dir = style.flexDirection;
      setHorizontal(isFlex && (dir === "row" || dir === "row-reverse"));
    }, []);

    const renderItem = useCallback(
      (contribution: Contribution): ReactNode => {
        const cId = contribution.id as string | undefined;
        if (!cId) return null;
        const clean = cleanById.get(cId as (P & { id: string })["id"]);
        if (!clean) return null;

        const wrapped = children
          ? applyItemMiddlewares(
              children(clean as unknown as P & { id: string }),
              id,
              contribution,
            )
          : renderContributionIsolated(clean, contribution, id);
        return horizontal ? (
          // A single-child `min-w-0` flex cell relaying the shrink-chain to each
          // contribution (so flexible text truncates instead of wrapping). Frame
          // with only `content` is exactly this: one `minmax(0,1fr)` grid track,
          // center-aligned — the min-w-0 flexible cell expressed as a role.
          <Frame key={cId} content={wrapped} />
        ) : (
          <Fragment key={cId}>{wrapped}</Fragment>
        );
      },
      [cleanById, children, horizontal],
    );

    const defaultRendering = (
      <>{rawContributions.map((c) => renderItem(c))}</>
    );

    let result: ReactNode = defaultRendering;
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

    // Sentinel: a zero-layout (`display:none`) sibling of the contributions,
    // used to read the host container's flex-direction for the `min-w-0` cell
    // wrapping above. Rendered alongside `result` so it survives the reorder
    // middleware path (which renders its own item list, not `children`).
    const withSentinel = (
      <>
        <span ref={sentinelRef} className="hidden" aria-hidden />
        {result}
      </>
    );

    // Size-owning slot: one provider wraps the whole contribution list so every
    // item inherits the declared density (see `controlSize` config).
    const withDensity =
      controlSize !== undefined ? (
        <ControlSizeProvider size={controlSize}>
          {withSentinel}
        </ControlSizeProvider>
      ) : (
        withSentinel
      );

    if (subId !== undefined) {
      return (
        <RenderSlotSubIdContext.Provider value={subId}>
          {withDensity}
        </RenderSlotSubIdContext.Provider>
      );
    }

    return withDensity;
  };

  return renderSlot;
}

/**
 * A headless contribution: mounts for side effects, renders nothing. Typed as
 * `=> null` so a component that returns JSX fails to compile — the structural
 * guarantee that a mount slot is non-visual.
 */
export type MountComponent<P = {}> = (props: P) => null;

export interface MountSlotConfig<P> {
  docLabel?: (props: P & { id: string }) => string | undefined;
}

export interface MountSlot<P>
  extends Slot<{ id: string; component: MountComponent<P> } & P> {
  /**
   * Mounts every contribution wrapped in item middlewares (error-boundary
   * isolation), no list/reorder middleware. Prop-less; renders null visually.
   */
  Mount: ComponentType;
}

/**
 * Headless sibling of `defineRenderSlot`: contributions mount for their side
 * effects and render nothing. `.Mount` wraps each contribution in the item
 * middlewares (error-boundary isolation) — exactly the per-item path `.Render`
 * uses — but applies NO list/reorder middleware, no `controlSize`, and no flex
 * sentinel, all irrelevant to invisible content. The component type is
 * constrained to `(props) => null` so a JSX-returning contributor fails to
 * compile.
 */
export function defineMountSlot<P = {}>(
  id: string,
  config?: MountSlotConfig<P>,
): MountSlot<P> {
  const slot = defineSlot<{ id: string; component: MountComponent<P> } & P>(
    id,
    { docLabel: config?.docLabel },
  );

  const mountSlot = slot as unknown as MountSlot<P>;

  mountSlot.Mount = function SlotMount() {
    const ctx = useContext(PluginRuntimeContext);
    if (!ctx) {
      throw new Error("SlotMount must be used within PluginProvider");
    }

    const rawContributions = ctx.bySlot.get(id) ?? [];
    const cleanItems = slot.useContributions();

    const cleanById = useMemo(
      () => new Map(cleanItems.map((item) => [item.id as string, item])),
      [cleanItems],
    );

    return (
      <>
        {rawContributions.map((contribution) => {
          const cId = contribution.id as string | undefined;
          if (!cId) return null;
          const clean = cleanById.get(cId);
          if (!clean) return null;
          return (
            <Fragment key={cId}>
              {renderContributionIsolated(clean, contribution, id)}
            </Fragment>
          );
        })}
      </>
    );
  };

  return mountSlot;
}

/**
 * A wrapper contribution: a component that renders `children`. Contributed to a
 * wrapper slot so the slot can fold it (and every sibling) around the host's
 * content — e.g. a per-surface React context Provider injected from a plugin the
 * host cannot import.
 */
export interface WrapContribution {
  id?: string;
  component: ComponentType<{ children: ReactNode }>;
}

export interface WrapperSlotConfig<P extends object> {
  docLabel?: (c: WrapContribution & P) => string | undefined;
}

export interface WrapperSlot<P extends object = {}>
  extends Slot<WrapContribution & P> {
  /**
   * Folds every contributed wrapper OUTSIDE-IN around `children`, in
   * contribution order: the first contribution is the OUTERMOST wrapper, the
   * last is innermost (nearest `children`). With no contributions, returns
   * `children` unchanged.
   */
  Wrap: ComponentType<{ children: ReactNode }>;
}

/**
 * A slot whose contributions are `{children}` wrappers folded around the host's
 * content. Unlike `.Render`/`.Mount`, a wrapper slot does NOT render the
 * contributions as siblings — it nests them, so several plugins can each inject
 * a wrapping component (typically a React context Provider) above ONE shared
 * subtree. The canonical use: a plugin that the host can't import (a cycle)
 * needs a provider above the host's children; it contributes the provider here
 * and the host folds it in.
 *
 * NOT isolated by the item middlewares: a wrapper that crashes must crash the
 * subtree it wraps (a missing provider can't be "skipped" — its consumers would
 * throw anyway), and error boundaries don't compose with arbitrary providers.
 * This mirrors `Core.Root`'s direct unseal for the same structural reason.
 *
 * Fold direction: `reduceRight` makes `contributions[0]` the outermost wrapper —
 * matching `applyItemMiddlewares`, where the first (lowest-priority) middleware
 * also ends up outermost.
 */
export function defineWrapperSlot<P extends object = {}>(
  id: string,
  config?: WrapperSlotConfig<P>,
): WrapperSlot<P> {
  const slot = defineSlot<WrapContribution & P>(id, {
    docLabel: config?.docLabel ? (c) => config.docLabel!(c) : undefined,
  });

  const wrapperSlot = slot as unknown as WrapperSlot<P>;

  wrapperSlot.Wrap = function SlotWrap({ children }: { children: ReactNode }) {
    const ctx = useContext(PluginRuntimeContext);
    if (!ctx) {
      throw new Error("SlotWrap must be used within PluginProvider");
    }

    const cleanItems = slot.useContributions();

    return cleanItems.reduceRight<ReactNode>((acc, clean) => {
      const component = (clean as { component?: unknown }).component;
      if (typeof component !== "function") return acc;
      const C = UNSAFE_unsealSlotComponent(
        component as unknown as SealedComponent,
      ) as ComponentType<{ children: ReactNode }>;
      return createElement(C, null, acc);
    }, children);
  };

  return wrapperSlot;
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
    // `_pluginId` for the error-boundary middleware. The fallback path has no
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

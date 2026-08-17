import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "./context";
import { recordCreatedSlot } from "@plugins/framework/plugins/slot-declaration/core";
import type { Contribution } from "./types";
import type { ComponentType } from "react";
import type { SealContributions } from "./sealed-component";
import type { SlotHandle } from "@plugins/framework/plugins/slot-declaration/core";

export interface Slot<P> extends SlotHandle {
  (props: P): Contribution;
  useContributions(): SealContributions<P>[];
}

const EMPTY: Contribution[] = [];

/**
 * The one constructor every slot funnels through — `defineRenderSlot`,
 * `defineMountSlot`, `defineWrapperSlot` and `defineDispatchSlot` all call it,
 * and `defineOrderedDispatchSlot` wraps dispatch. So the `meta` stamped and the
 * created-set appended here cover EVERY slot that has ever been created, with
 * no registry to keep in sync. Each richer constructor overwrites `meta.kind`
 * (and `reorderable`) with its own.
 */
export function defineSlot<P>(
  id: string,
  opts?: { docLabel?: (props: P) => string | undefined },
): Slot<P> {
  const slot = ((props: P) => ({
    _slotId: id,
    _doc: { label: opts?.docLabel?.(props) },
    ...props,
  })) as unknown as Slot<P>;
  slot.id = id;
  slot.meta = { kind: "slot", reorderable: false };
  recordCreatedSlot(slot);

  slot.useContributions = () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- method named useContributions; ESLint doesn't recognize object.useX as a hook
    const ctx = useContext(PluginRuntimeContext);
    if (!ctx) {
      throw new Error("useContributions must be used within PluginProvider");
    }
    const raw = ctx.bySlot.get(id) ?? EMPTY;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- same as above
    return useMemo(
      () =>
        raw.map(
          ({ _slotId: _, ...rest }: Contribution) =>
            rest as SealContributions<P>,
        ),
      [raw],
    );
  };

  return slot;
}

export const Core = {
  Root: defineSlot<{ component: ComponentType }>("core.root"),
  // Async boot-readiness tasks. App awaits every Core.Boot `run()` once, before
  // the first render, so plugins can hydrate caches (e.g. config) that the
  // initial paint depends on — replacing per-component Suspense fallbacks.
  //
  // This is a sibling to `register` (one-shot, pre-render), NOT a general
  // lifecycle hook: readiness/hydration only, run once, and a failing or hung
  // task must never brick boot (App uses allSettled + log-and-skip). For
  // per-phase behavior, use React's own lifecycle inside a contributed component.
  Boot: defineSlot<{ run: () => Promise<void> }>("core.boot"),
};

/**
 * web-sdk's own slot declaration — the `PluginDefinition.slots` contract for a
 * plugin that has no `web/index.ts` because it IS the web runtime. It declares
 * on the module the plugin system loads it from (its core barrel), and the same
 * collectors that read a plugin barrel's `default.slots` read this.
 */
export const slots = [Core];

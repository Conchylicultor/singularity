import { useContext } from "react";
import { PluginRuntimeContext } from "./context";
import type { Contribution } from "./types";
import type { ComponentType } from "react";

export interface Slot<P> {
  (props: P): Contribution;
  useContributions(): P[];
}

export function defineSlot<P>(id: string): Slot<P> {
  const slot = ((props: P) => ({ _slotId: id, ...props })) as unknown as Slot<P>;

  slot.useContributions = () => {
    const ctx = useContext(PluginRuntimeContext);
    if (!ctx) {
      throw new Error("useContributions must be used within PluginProvider");
    }
    return ctx.contributions
      .filter((c: Contribution) => c._slotId === id)
      .map(({ _slotId: _, ...rest }: Contribution) => rest as P);
  };

  return slot;
}

export const Core = {
  Root: defineSlot<{ component: ComponentType }>("core.root"),
};

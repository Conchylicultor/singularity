import { useContext } from "react";
import { PluginRuntimeContext } from "./context";
import type { Contribution } from "./types";
import type { ComponentType } from "react";

export interface Slot<P> {
  (props: P): Contribution;
  id: string;
  useContributions(): P[];
}

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

  slot.useContributions = () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- method named useContributions; ESLint doesn't recognize object.useX as a hook
    const ctx = useContext(PluginRuntimeContext);
    if (!ctx) {
      throw new Error("useContributions must be used within PluginProvider");
    }
    return (ctx.bySlot.get(id) ?? []).map(
      ({ _slotId: _, ...rest }: Contribution) => rest as P,
    );
  };

  return slot;
}

export const Core = {
  Root: defineSlot<{ component: ComponentType }>("core.root"),
};

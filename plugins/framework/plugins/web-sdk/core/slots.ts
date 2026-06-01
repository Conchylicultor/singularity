import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "./context";
import type { Contribution } from "./types";
import type { ComponentType } from "react";
import type { SealContributions } from "./sealed-component";

export interface Slot<P> {
  (props: P): Contribution;
  id: string;
  useContributions(): SealContributions<P>[];
}

const EMPTY: Contribution[] = [];

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
};

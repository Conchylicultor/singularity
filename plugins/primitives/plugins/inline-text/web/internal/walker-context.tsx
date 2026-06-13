import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface InlineTextWalker {
  transform: (children: ReactNode) => ReactNode;
}

export interface StackedInlineWalkers {
  transforms: Array<(children: ReactNode) => ReactNode>;
}

const ctx = createContext<StackedInlineWalkers>({ transforms: [] });

export const InlineTextWalkerContext = ctx;

// Appends a walker's transform to the inherited stack. A null addition (e.g. a
// walker that has no work in the current context) passes the parent through
// unchanged. Mirrors useMarkdownEnhancement's transform stacking.
export function useInlineTextWalker(
  addition: InlineTextWalker | null,
): StackedInlineWalkers {
  const parent = useContext(ctx);
  return useMemo(() => {
    if (!addition) return parent;
    return { transforms: [...parent.transforms, addition.transform] };
  }, [parent, addition]);
}

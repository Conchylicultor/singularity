import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Components } from "react-markdown";

export interface MarkdownEnhancement {
  transform?: (children: ReactNode) => ReactNode;
  components?: Partial<Components>;
  inlineCode?: (text: string) => ReactNode | null;
}

export interface StackedEnhancement {
  transforms: Array<(children: ReactNode) => ReactNode>;
  components: Partial<Components>;
  inlineCodeHandlers: Array<(text: string) => ReactNode | null>;
}

const ctx = createContext<StackedEnhancement>({
  transforms: [],
  components: {},
  inlineCodeHandlers: [],
});

export const MarkdownEnhancementContext = ctx;

export function useMarkdownEnhancement(
  addition: MarkdownEnhancement | null,
): StackedEnhancement {
  const parent = useContext(ctx);
  return useMemo(() => {
    if (!addition) return parent;
    return {
      transforms: addition.transform
        ? [...parent.transforms, addition.transform]
        : parent.transforms,
      components: addition.components
        ? { ...parent.components, ...addition.components }
        : parent.components,
      inlineCodeHandlers: addition.inlineCode
        ? [...parent.inlineCodeHandlers, addition.inlineCode]
        : parent.inlineCodeHandlers,
    };
  }, [parent, addition]);
}

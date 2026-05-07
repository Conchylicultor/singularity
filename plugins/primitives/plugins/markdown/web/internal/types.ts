import type { ReactNode } from "react";
import type { Components } from "react-markdown";

export type CodeHandler = {
  block?: (text: string, lang: string | null) => ReactNode | null;
  inline?: (text: string) => ReactNode | null;
};

export type MarkdownExtension = {
  id: string;
  priority?: number;
  useComponents?: () => Partial<Components>;
  useTransform?: () => ((children: ReactNode) => ReactNode) | null;
  useCodeHandler?: () => CodeHandler | null;
};

import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { ImageNode } from "./image-node";

export const PROMPT_EDITOR_THEME = {
  paragraph: "m-0",
  text: { base: "" },
} as const;

export function buildInitialConfig(opts: {
  namespace: string;
  onError: (err: Error) => void;
}): InitialConfigType {
  return {
    namespace: opts.namespace,
    theme: PROMPT_EDITOR_THEME,
    nodes: [ImageNode],
    onError: opts.onError,
  };
}

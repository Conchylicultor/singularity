import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { getNodeExtensions } from "./node-extensions";

export const TEXT_EDITOR_THEME = {
  paragraph: "m-0",
  text: { base: "" },
} as const;

export function buildInitialConfig(opts: {
  namespace: string;
  onError: (err: Error) => void;
}): InitialConfigType {
  return {
    namespace: opts.namespace,
    theme: TEXT_EDITOR_THEME,
    nodes: getNodeExtensions().map((ext) => ext.node),
    onError: opts.onError,
  };
}

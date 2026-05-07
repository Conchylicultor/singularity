import { HighlightedCode } from "./highlighted-code";
import type { CodeHandler } from "@plugins/primitives/plugins/markdown/web";

export function useSyntaxHighlightCodeHandler(): CodeHandler {
  return {
    block: (text, lang) => <HighlightedCode code={text} lang={lang} />,
  };
}

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { DecoratorNavPlugin } from "./components/decorator-nav-plugin";

export default {
  description:
    "Caret crossing over inline decorator nodes for Lexical editors: one ArrowLeft/ArrowRight steps to the far side instead of stalling on the contenteditable=false span.",
  contributions: [],
} satisfies PluginDefinition;

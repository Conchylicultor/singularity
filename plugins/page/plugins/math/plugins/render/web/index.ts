import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { KatexMath } from "./components/katex-math";

export { KatexMath };

export default {
  description:
    "Shared KaTeX renderer leaf for the page math plugins: <KatexMath/> plus the single home for KaTeX config and CSS.",
  contributions: [],
} satisfies PluginDefinition;

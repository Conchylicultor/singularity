import { lazyComponent } from "@plugins/primitives/plugins/lazy-component/web";
import type { KatexMathProps } from "./katex-math-impl";

// Lazy-loaded: keeps the ~259KB katex package out of the eager plugin-boot
// wave. `fallback: null` because math renders inline — pop in once the chunk
// resolves rather than showing a loading placeholder.
export const KatexMath = lazyComponent<KatexMathProps>(
  () => import("./katex-math-impl").then((m) => ({ default: m.KatexMath })),
  { fallback: null },
);

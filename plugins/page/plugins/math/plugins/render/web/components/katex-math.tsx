import "katex/dist/katex.min.css"; // Vite bundles the CSS + woff2 fonts (pattern: terminal imports xterm.css)
import katex from "katex";
import { useMemo } from "react";

/**
 * The single home for KaTeX rendering across the page math plugins (block
 * equations + inline math). Owns the KaTeX config so error styling and output
 * mode stay consistent everywhere math is drawn.
 *
 * `throwOnError: false` makes KaTeX render parse errors inline in `errorColor`
 * rather than throwing — fail-soft display is correct here (the user is mid-typing
 * a formula), and is a *render* concern, not a swallowed exception.
 */
export function KatexMath({
  expression,
  display,
  className,
}: {
  expression: string;
  display: boolean;
  className?: string;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(expression, {
        displayMode: display,
        throwOnError: false,
        output: "html",
        errorColor: "var(--destructive)", // matches theme tokens
      }),
    [expression, display],
  );
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

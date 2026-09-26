import type { ComponentProps } from "react";

/**
 * THE inline (non-fenced) `<code>` element. One definition, so every surface that
 * renders a backticked span — the base markdown map here, and the active-data
 * arbitration chain's terminal — is pixel-identical by construction rather than by
 * a copied class string.
 *
 * Its shape and type are the inline-code tokens — density `padCode*`, shape
 * `radiusCode` / `borderCode`, type-scale `fontSizeCode` / `lineHeightCode`,
 * palette `codeBorder` — whose defaults are the `rounded-md`, `xs` × `2xs` pad,
 * caption type and no border it always wore.
 */
export function InlineCode({ children, ...rest }: ComponentProps<"code">) {
  return (
    <code
      className="rounded-inline-code hairline-inline-code border-code-border bg-muted p-inline-code font-mono text-inline-code"
      {...rest}
    >
      {children}
    </code>
  );
}

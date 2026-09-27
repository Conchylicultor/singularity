import type { ComponentProps } from "react";

/**
 * THE inline (non-fenced) `<code>` element. One definition, so every surface that
 * renders a backticked span — the base markdown map here, and the active-data
 * arbitration chain's terminal — is pixel-identical by construction rather than by
 * a copied class string.
 *
 * Its shape is the inline-code tokens — density `padCode*`, shape
 * `radiusCode` / `borderCode`, palette `codeBorder` — whose defaults are the
 * `rounded-md`, `xs` × `2xs` pad and no border it always wore; its type is the
 * `code` role (`text-code`, which also carries the mono family).
 */
export function InlineCode({ children, ...rest }: ComponentProps<"code">) {
  return (
    <code
      className="rounded-inline-code hairline-inline-code border-code-border bg-muted p-inline-code text-code"
      {...rest}
    >
      {children}
    </code>
  );
}

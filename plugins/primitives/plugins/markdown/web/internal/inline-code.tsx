import type { ComponentProps } from "react";

/**
 * THE inline (non-fenced) `<code>` element. One definition, so every surface that
 * renders a backticked span — the base markdown map here, and the active-data
 * arbitration chain's terminal — is pixel-identical by construction rather than by
 * a copied class string.
 */
export function InlineCode({ children, ...rest }: ComponentProps<"code">) {
  return (
    <code className="rounded-md bg-muted px-xs py-2xs font-mono text-caption" {...rest}>
      {children}
    </code>
  );
}

import type { ReactNode } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * A link inside a sentence of the download page — the local app's address, the
 * guide. The `inline` aspect of a `link` button, like the homepage's story
 * link: it takes the sentence's size and flow, underlined in the quiet grey,
 * and comes up to full foreground on hover.
 */
export function DownloadLink({
  href,
  onClick,
  children,
}: {
  children: ReactNode;
} & (
  { href: string; onClick?: never } | { onClick: () => void; href?: never }
)) {
  return (
    <Button
      variant="link"
      aspect="inline"
      className="text-foreground decoration-muted-foreground/60 hover:decoration-foreground underline"
      onClick={onClick}
      render={
        href === undefined ? undefined : (
          <a href={href} target="_blank" rel="noreferrer noopener" />
        )
      }
    >
      {children}
    </Button>
  );
}

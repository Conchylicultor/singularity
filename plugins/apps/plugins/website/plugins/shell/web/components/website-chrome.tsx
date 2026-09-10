import type { ReactNode } from "react";
import { PaneChrome, type AnyPane } from "@plugins/primitives/plugins/pane/web";
import { WebsitePage } from "./website-page";

/**
 * The one chrome every website pane wears: the shared site header above, the
 * page's bands, then the site footer.
 *
 * It exists so a new page costs a `WebsiteChrome` and nothing else — the header
 * is borrowed by naming `actions: WebsiteHeader` on the pane, and the footer
 * comes from being inside this. A pane that reached for `PaneChrome` directly
 * would be a page missing its footer, and nothing would say so.
 *
 * The header floats over the top of the page (`floatingHeader`): clear while
 * the reader is at the top, so the hero's glow runs up behind the wordmark and
 * the nav as the design draws it, and masked with its rule once the page
 * scrolls under it.
 */
export function WebsiteChrome({
  pane,
  children,
}: {
  pane: AnyPane;
  children: ReactNode;
}) {
  return (
    <PaneChrome pane={pane} floatingHeader>
      <WebsitePage>{children}</WebsitePage>
    </PaneChrome>
  );
}

import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { WebsiteBand } from "./website-band";
import { WordmarkText } from "./website-wordmark";

/**
 * The site-wide footer, rendered at the end of every website pane's content
 * (via `WebsitePage`) so it scrolls with the page like a real site footer.
 *
 * The wordmark signs the document off, small and in the tertiary grey — the
 * one thing on it. There is nothing to sell and nothing to download, so there is
 * no reason for a footer with columns; the source lives behind the contact
 * band's GitHub link.
 */
export function WebsiteFooter() {
  return (
    <WebsiteBand as="footer" divider rhythm="footer">
      <Line>
        <WordmarkText variant="body" className="text-muted-foreground/60" />
      </Line>
    </WebsiteBand>
  );
}

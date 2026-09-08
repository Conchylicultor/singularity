import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SOURCE_URL } from "../../core";
import { WebsiteBand } from "./website-band";
import { WordmarkText } from "./website-wordmark";

/**
 * The site-wide footer, rendered at the end of every website pane's content
 * (via `WebsitePage`) so it scrolls with the page like a real site footer.
 *
 * The wordmark signs the document off; the source link is the only other thing
 * on it. There is nothing to sell and nothing to download, so there is no reason
 * for a footer with columns.
 */
export function WebsiteFooter() {
  return (
    <WebsiteBand as="footer" divider y="lg">
      <Line>
        <WordmarkText />
        <Fill />
        <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener">
          <Text
            variant="caption"
            tone="muted"
            className="hover:text-foreground hover:underline"
          >
            Source
          </Text>
        </a>
      </Line>
    </WebsiteBand>
  );
}

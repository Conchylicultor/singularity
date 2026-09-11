import { SiGithub } from "react-icons/si";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { insetClass } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { CONTACT_EMAIL, CONTACT_MAILTO, SOURCE_URL } from "../../core";
import { WebsiteBand } from "./website-band";
import { WordmarkText } from "./website-wordmark";

/**
 * The site-wide footer, rendered at the end of every website pane's content
 * (via `WebsitePage`) so it scrolls with the page like a real site footer.
 *
 * Two ends. The wordmark signs the document off at the leading edge, small and
 * in the tertiary grey. The trailing edge is where the site can be reached: the
 * one address, and the source on GitHub. There is nothing to sell and nothing to
 * download, so there is no reason for a footer with columns — and because every
 * page wears this one, the way to write is never more than a scroll away, which
 * is what lets the header spend its one call to action on something else.
 *
 * A `Cluster`, not a line: both ends are rigid (an email address that ellipsizes
 * is an address you cannot read), so on a screen too narrow for both the links
 * drop under the wordmark instead of crushing it.
 */
export function WebsiteFooter() {
  return (
    <WebsiteBand as="footer" divider rhythm="footer">
      <Cluster justify="between" gap="md">
        <WordmarkText variant="body" className="text-muted-foreground/60" />
        <Inline gap="lg">
          {/* A real `mailto:` link, so the reader can copy the address or read
              it off the status bar before committing to anything. Muted like a
              quiet nav link, and like one it comes up to full foreground. */}
          <a
            href={CONTACT_MAILTO}
            className="text-muted-foreground hover:text-foreground"
          >
            <Text variant="caption">{CONTACT_EMAIL}</Text>
          </a>
          {/* The anchor must ITSELF be the padded box (a wrapper would make the
              ring bigger than the click target), and `Inset` names no `href` —
              so this is the class-helper half of the own-it/don't rule. */}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Source on GitHub"
            className={cn(
              insetClass({ pad: "sm" }),
              "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground rounded-full border",
            )}
          >
            <SiGithub className="size-4.5" />
          </a>
        </Inline>
      </Cluster>
    </WebsiteBand>
  );
}

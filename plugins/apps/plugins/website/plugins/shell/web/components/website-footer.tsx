import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const YEAR = new Date().getFullYear();

/**
 * The site-wide footer, rendered at the end of every website pane's content
 * (via `WebsitePage`) so it scrolls with the page like a real site footer. A
 * minimal two-part strip: a brand block on the left (wordmark + tagline) and a
 * muted copyright line on the right, constrained to the same reading gutter as
 * the page content.
 */
export function WebsiteFooter() {
  return (
    <footer className="border-t bg-background">
      <Inset x="xl" y="xl">
        <Stack
          direction="row"
          justify="between"
          align="center"
          gap="lg"
          wrap
          className="mx-auto w-full max-w-5xl"
        >
          <Stack gap="2xs">
            <Text variant="subheading" className="tracking-tight">
              equin
            </Text>
            <Text variant="caption" tone="muted">
              The self-evolving app for the agentic era.
            </Text>
          </Stack>
          <Text variant="caption" tone="muted">
            © {YEAR} equin
          </Text>
        </Stack>
      </Inset>
    </footer>
  );
}

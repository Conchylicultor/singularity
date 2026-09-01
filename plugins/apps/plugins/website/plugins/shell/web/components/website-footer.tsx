import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/** The repository the site is built out of — the one link the footer carries. */
const REPO_URL = "https://github.com/Conchylicultor/singularity";

/**
 * The site-wide footer, rendered at the end of every website pane's content
 * (via `WebsitePage`) so it scrolls with the page like a real site footer.
 *
 * One quiet line: the project, and where the code is. There is nothing to sell
 * and nothing to download, so there is no reason for a footer with columns.
 */
export function WebsiteFooter() {
  return (
    <footer className="border-t bg-background">
      <Inset x="xl" y="lg">
        <Stack
          direction="row"
          gap="xs"
          align="center"
          className="mx-auto w-full max-w-5xl"
        >
          <Text variant="caption" tone="muted">
            equin ·
          </Text>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            <Text
              variant="caption"
              tone="muted"
              className="hover:text-foreground hover:underline"
            >
              Source
            </Text>
          </a>
        </Stack>
      </Inset>
    </footer>
  );
}

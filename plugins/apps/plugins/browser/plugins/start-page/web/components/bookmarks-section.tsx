import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { browserBookmarksResource } from "@plugins/apps/plugins/browser/plugins/bookmarks/web";
import { LinkTile } from "./link-tile";

/**
 * The "Bookmarks" section: a grid of bookmark tiles from the live
 * `browser-bookmarks` resource. Rendered only once data is present and
 * non-empty (no empty heading while pending/empty) — the same sanctioned
 * narrowing the bookmarks bar uses.
 */
export function BookmarksSection() {
  const { navigate } = useBrowserNav();
  const result = useResource(browserBookmarksResource);

  return matchResource(result, {
    pending: () => null,
    ready: (bookmarks) => {
      if (bookmarks.length === 0) return null;
      return (
        <Stack gap="sm">
          <SectionLabel>Bookmarks</SectionLabel>
          <Grid minCellWidth="8.5rem" gap="sm">
            {bookmarks.map((b) => (
              <LinkTile
                key={b.id}
                url={b.url}
                label={b.title}
                onClick={() => navigate(b.url)}
              />
            ))}
          </Grid>
        </Stack>
      );
    },
  });
}

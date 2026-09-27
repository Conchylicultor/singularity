import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { browserBookmarks } from "@plugins/apps/plugins/browser/plugins/bookmarks/web";
import { LinkTile } from "./link-tile";

/**
 * The "Bookmarks" section: a grid of bookmark tiles from the live
 * `browserBookmarks` collection's default window (oldest first, 100), with a
 * "Show more" that grows it when it is full. Rendered only once data is
 * present and non-empty (no empty heading while pending/empty) — the same
 * sanctioned narrowing the bookmarks bar uses.
 */
export function BookmarksSection() {
  const { navigate } = useBrowserNav();
  const result = useLive(browserBookmarks);
  // A grow in flight reports `canGrow: false` (the grown window's size is not
  // known yet), so the button stays up — loading — while `growing`.
  const more =
    !result.pending && (result.canGrow || result.growing) ? (
      <Button
        variant="ghost"
        loading={result.growing}
        onClick={result.loadMore}
      >
        Show more
      </Button>
    ) : null;

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
          {more}
        </Stack>
      );
    },
  });
}

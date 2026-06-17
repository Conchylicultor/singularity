import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { LinkTile } from "./link-tile";

/**
 * A curated set of framing-friendly default sites — these allow iframe
 * embedding, so clicking a tile actually loads the page inside the webview.
 */
const QUICK_LINKS: { url: string; label: string }[] = [
  { url: "https://example.com", label: "Example" },
  { url: "https://news.ycombinator.com", label: "Hacker News" },
  { url: "https://developer.mozilla.org", label: "MDN" },
];

/** The quick-links grid: curated default sites as favicon tiles. */
export function QuickLinks() {
  const { navigate } = useBrowserNav();
  return (
    <Grid minCellWidth="8.5rem" gap="sm">
      {QUICK_LINKS.map((link) => (
        <LinkTile
          key={link.url}
          url={link.url}
          label={link.label}
          onClick={() => navigate(link.url)}
        />
      ))}
    </Grid>
  );
}

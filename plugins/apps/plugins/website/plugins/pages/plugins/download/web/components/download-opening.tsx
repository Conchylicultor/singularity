import { WebsiteHero } from "@plugins/apps/plugins/website/plugins/shell/web";

/**
 * The download page's heading: what the reader is about to do, and why it is
 * worth doing — a copy of their own.
 */
export function DownloadOpening() {
  return (
    <WebsiteHero
      kind="page"
      lead="Run "
      accent="equin"
      trail=" on your machine."
      lede="Your own copy, yours to reshape."
    />
  );
}

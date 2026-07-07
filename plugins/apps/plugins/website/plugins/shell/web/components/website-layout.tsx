import { FullPane } from "@plugins/layouts/plugins/full-pane/web";

/**
 * The website's app surface. A pure full-surface app (like Sonata): the
 * full-pane renderer paints the active site pane — landing at `/website`,
 * blog / downloads at their own segments — filling the whole surface. The
 * persistent site header is NOT a layout concern: it is the shared
 * `WebsiteToolbar` pane header every website pane opts into, so navigation
 * chrome and pane chrome are one bar.
 */
export function WebsiteLayout() {
  return (
    <div className="h-full min-h-0">
      <FullPane />
    </div>
  );
}

import type { ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { WebsiteFooter } from "./website-footer";

/**
 * Standard body wrapper for every website pane: the page content followed by
 * the site-wide footer, pinned to the bottom on short pages (`Fill` absorbs
 * the slack) and scrolling with the content on long ones. Section plugins
 * wrap their pane bodies in this so the footer exists exactly once.
 */
export function WebsitePage({ children }: { children: ReactNode }) {
  return (
    <Stack gap="none" className="min-h-full bg-card">
      <Fill axis="y">{children}</Fill>
      <WebsiteFooter />
    </Stack>
  );
}

import type { ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { WebsiteFooter } from "./website-footer";

/**
 * Standard body wrapper for every website pane: the page content followed by
 * the site-wide footer, pinned to the bottom on short pages (`Fill` absorbs
 * the slack) and scrolling with the content on long ones.
 *
 * Reached through `WebsiteChrome`, never directly — that is what makes "the
 * footer exists exactly once per page" true by construction rather than by every
 * pane author remembering.
 */
export function WebsitePage({ children }: { children: ReactNode }) {
  return (
    <Stack gap="none" className="bg-background min-h-full">
      <Fill axis="y">{children}</Fill>
      <WebsiteFooter />
    </Stack>
  );
}

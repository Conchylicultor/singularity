import { MdOpenInNew } from "react-icons/md";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Hero } from "./hero";
import { QuickLinks } from "./quick-links";
import { BookmarksSection } from "./bookmarks-section";
import { RecentsSection } from "./recents-section";

/**
 * The browser start page: the empty-state landing shown in the viewport when no
 * URL is loaded. A vertically-scrollable, centered, max-width column with a
 * hero (wordmark + search), quick links, and the live bookmarks / recents
 * sections. The webview already provides the scroll container, so this only
 * lays out content — it never owns a second scroll region.
 */
export function StartPage() {
  return (
    <Inset x="xl" y="2xl" className="mx-auto w-full max-w-2xl">
      <Stack gap="2xl">
        <Hero />
        <QuickLinks />
        <BookmarksSection />
        <RecentsSection />
        <Stack direction="row" gap="2xs" align="center" justify="center">
          <MdOpenInNew style={{ width: 14, height: 14 }} />
          <Text variant="caption" tone="muted">
            Some sites block embedding — use the open-in-new-tab button to open
            them in a new tab.
          </Text>
        </Stack>
      </Stack>
    </Inset>
  );
}

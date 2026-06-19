import { type ReactElement } from "react";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { PagesWelcome } from "./slots";

export const pagesRootPane = Pane.define({
  id: "pages-root",
  // Empty segment + `appPath` makes this the Pages app's index pane: bare
  // `/pages` (basePath-stripped to "/") resolves here instead of the global
  // agent-manager welcome pane. The page tree lives in the sidebar slot, so
  // this pane is the landing surface shown before a page is opened — a
  // quick-create + recent-pages launchpad rather than a bare placeholder.
  segment: "",
  appPath: "/pages",
  component: PagesRoot,
  chrome: false,
});

function PagesRoot(): ReactElement {
  // The Miller leaf column fills the surface and ignores its own width, so the
  // landing scrolls vertically and centers its content with a max-width column.
  return (
    <Scroll className="h-full">
      <Inset x="2xl" y="2xl" className="mx-auto w-full max-w-2xl">
        <Stack gap="2xl">
          <Stack gap="2xs">
            <Text as="h1" variant="title">
              Pages
            </Text>
            <Text as="p" variant="body" tone="muted">
              Create a page or jump back into a recent one.
            </Text>
          </Stack>
          <Stack gap="2xl">
            <PagesWelcome.Section.Render>
              {(s) => <s.component />}
            </PagesWelcome.Section.Render>
          </Stack>
        </Stack>
      </Inset>
    </Scroll>
  );
}

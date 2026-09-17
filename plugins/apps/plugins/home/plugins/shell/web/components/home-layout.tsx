import { PaneOverlayHost } from "@plugins/layouts/plugins/miller/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";

import { Home } from "../slots";

/**
 * The launcher page: a centred title block, then the sections (the app grid
 * with its capsule toolbar), in one column `min(920px, 100% − 40px)` wide —
 * seven 116px icon cells and their gaps — centred in the tab.
 */
export function HomeLayout() {
  return (
    <Stack gap="none" className="relative h-full bg-background">
      <Column
        gap="none"
        className="h-full w-full"
        // The column body owns the single scroll, so the DataView's sticky
        // capsule pins to the top of the tab once the title scrolls away.
        body={
          // The container the page margin's query reads: the tab's width, not
          // the viewport's, so a narrow floating window gets the tighter margin.
          <Center axis="horizontal" className="@container/home">
            <Stack
              gap="lg"
              // eslint-disable-next-line spacing/no-adhoc-spacing -- the launcher's page margin (64px, 40px under 760px) and its column measure (seven 116px cells + gaps, 20px gutters) are page geometry above the spacing ramp's largest step
              className="w-[min(920px,calc(100%-40px))] py-[64px] @max-[760px]/home:py-[40px]"
            >
              <Stack
                as="header"
                gap="xs"
                align="center"
                className="text-center"
              >
                {/* The page's one headline: the display rung at the mock's
                    semibold weight (display is bold by default). */}
                <Text as="h1" variant="display" className="font-semibold">
                  Apps
                </Text>
                <Text as="p" variant="body" tone="muted">
                  Open an app to get started.
                </Text>
              </Stack>
              <Home.Section.Render />
            </Stack>
          </Center>
        }
      />
      {/* Bespoke full-surface layout: mount the pane overlay so global actions
          that open panes (e.g. the theme customizer) sync the registry and
          render here instead of throwing "Unknown pane". */}
      <PaneOverlayHost />
    </Stack>
  );
}

import { PaneOverlayHost } from "@plugins/layouts/plugins/miller/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

import { Home } from "../slots";

export function HomeLayout() {
  return (
    <div className="relative flex h-full flex-col bg-background">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-2xl py-2xl">
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- header offset from section area; sibling rhythm in a padded full-surface container, not a uniform gap */}
        <header className="mb-8 shrink-0">
          <Text as="h1" variant="title" className="tracking-tight">
            Apps
          </Text>
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- subtitle offset under the title inside a non-flex header */}
          <Text as="p" variant="body" tone="muted" className="mt-1">
            Open an app to get started.
          </Text>
        </header>
        {/* The section area owns bounded height so a full-surface section (e.g.
            the app-cards DataView) can fill it and scroll internally. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <Home.Section.Render />
        </div>
      </div>
      {/* Bespoke full-surface layout: mount the pane overlay so global actions
          that open panes (e.g. the theme customizer) sync the registry and
          render here instead of throwing "Unknown pane". */}
      <PaneOverlayHost />
    </div>
  );
}

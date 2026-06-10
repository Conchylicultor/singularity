import { Text } from "@plugins/primitives/plugins/text/web";

import { Home } from "../slots";

export function HomeLayout() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-8 py-10">
        <header className="mb-8 shrink-0">
          <Text as="h1" variant="title" className="tracking-tight">
            Apps
          </Text>
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
    </div>
  );
}

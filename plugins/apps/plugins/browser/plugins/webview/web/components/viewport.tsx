import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Browser,
  useBrowserTabs,
} from "@plugins/apps/plugins/browser/plugins/shell/web";
import { LoadingBar } from "./loading-bar";

/**
 * The webview viewport. Every tab with a real URL keeps a persistent iframe so
 * switching tabs preserves the loaded page; only the active tab is visible. The
 * active tab's start page (URL `""`) renders the contributed start page.
 */
export function Viewport() {
  const { tabs, finishLoad } = useBrowserTabs();
  const activeLoading = tabs.find((t) => t.active)?.loading ?? false;

  return (
    <Overlay
      className="h-full w-full bg-background"
      above={activeLoading ? <LoadingBar /> : undefined}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn("h-full w-full", !tab.active && "hidden")}
        >
          {tab.url === "" ? (
            tab.active ? (
              <StartPageHost />
            ) : null
          ) : (
            <iframe
              key={`${tab.id}:${tab.loadKey}`}
              src={tab.url}
              title="Browser viewport"
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              onLoad={() => finishLoad(tab.id)}
            />
          )}
        </div>
      ))}
    </Overlay>
  );
}

/**
 * Renders the contributed start page, or a tiny inline hint if none is
 * registered yet (the start-page plugin lands in a later wave).
 */
function StartPageHost() {
  const startPages = Browser.StartPage.useContributions();
  if (startPages.length > 0) {
    return (
      // eslint-disable-next-line layout/no-adhoc-layout -- start page scrolls within the fixed-height viewport box.
      <div className="h-full w-full overflow-auto">
        <Browser.StartPage.Render />
      </div>
    );
  }
  return (
    <Center className="h-full w-full">
      <Placeholder>Enter a URL to begin</Placeholder>
    </Center>
  );
}

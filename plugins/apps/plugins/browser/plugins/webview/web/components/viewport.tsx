import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  Browser,
  useBrowserNav,
} from "@plugins/apps/plugins/browser/plugins/shell/web";
import { LoadingBar } from "./loading-bar";

/** The iframe webview viewport: start page when no URL, else the framed page. */
export function Viewport() {
  const { current, loadKey, loading, finishLoad } = useBrowserNav();

  const body =
    current === "" ? (
      <StartPageHost />
    ) : (
      <iframe
        key={`${loadKey}:${current}`}
        src={current}
        title="Browser viewport"
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        onLoad={finishLoad}
      />
    );

  return (
    <Overlay
      className="h-full w-full bg-background"
      above={loading ? <LoadingBar /> : undefined}
    >
      <div className="h-full w-full">{body}</div>
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

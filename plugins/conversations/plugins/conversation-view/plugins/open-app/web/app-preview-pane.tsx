import {
  Pane,
  PaneChrome,
  PaneIconAction,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";
import { withEmbedFlag } from "@plugins/primitives/plugins/embed/core";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const openInNewIcon = symbol("open-in-new");
const chromeIcon = symbol("web-asset");

/**
 * Whether the framed app shows its own chrome (tab bar, app rail). One
 * browser-wide preference, shared by the header toggle and the frame through
 * the draft key, and kept until changed (no expiry).
 */
function useShowChrome() {
  return useDraft("open-app:show-chrome", false, { ttl: Infinity });
}

/**
 * The agent's own deploy, framed beside its conversation.
 *
 * `path` is the in-app route to open (path, query and hash) as ONE encoded
 * segment rather than a `:path*` wildcard: a wildcard needs at least one part,
 * and the app root `/` has none — so `/` is spelled by leaving `path` out.
 */
export const appPreviewPane = Pane.define({
  route: defineRoute({ id: "app-preview", segment: "app/:attemptId/:path?" }),
  app: agentManagerApp,
  component: AppPreviewPaneBody,
  title: { useText: ({ attemptId }) => attemptId },
  chrome: { history: false },
  width: 900,
  useResolve: false,
});

/**
 * The route's full URL on the agent's namespace. An attempt id IS its worktree
 * checkout name, and the main composition's prefix elides — so the attempt id
 * is the namespace.
 */
export function appPreviewUrl(attemptId: string, path: string | undefined) {
  return namespaceUrl(asNamespace(attemptId), path ?? "/");
}

function AppPreviewPaneBody() {
  const { attemptId, path } = appPreviewPane.useParams();
  const url = appPreviewUrl(attemptId, path);
  const origin = new URL(url).origin;
  const [showChrome] = useShowChrome();
  // Chromeless by default: the pane already sits in our own chrome, so the
  // framed app shows just the screen. The embed mode is read once at the
  // framed app's boot, so switching it is a new document (see `key`).
  const src =
    origin +
    withEmbedFlag(path ?? "/", origin, showChrome ? "chrome" : "chromeless");
  return (
    <PaneChrome pane={appPreviewPane}>
      <iframe
        // A new route is a new document: remount rather than let the old
        // frame's in-app navigation outlive the URL that named it.
        key={src}
        src={src}
        title={`App preview — ${attemptId}`}
        className="h-full w-full border-0"
      />
    </PaneChrome>
  );
}

/** Header action: the same route, unframed, in a new browser tab. */
export function OpenInNewTabAction() {
  const { attemptId, path } = appPreviewPane.useParams();
  return (
    <PaneIconAction
      label="Open in new tab"
      icon={openInNewIcon}
      onClick={() => window.open(appPreviewUrl(attemptId, path), "_blank")}
    />
  );
}

/** Header action: show or hide the framed app's own tab bar and app rail. */
export function ToggleChromeAction() {
  const [showChrome, setShowChrome] = useShowChrome();
  return (
    <PaneIconAction
      label={showChrome ? "Hide app chrome" : "Show app chrome"}
      icon={chromeIcon}
      aria-pressed={showChrome}
      onClick={() => setShowChrome((v) => !v)}
    />
  );
}

import type { ReactElement } from "react";
import { useDeferredLoadState } from "@plugins/framework/plugins/web-sdk/core";
import { Apps, resolveAppForPath } from "@plugins/apps-core/web";
import { parseUrl } from "@plugins/primitives/plugins/pane/web";
import {
  embedUrl,
  isEmbeddedDocument,
} from "@plugins/primitives/plugins/embed/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type {
  CounterpartKindProps,
  CounterpartResolution,
  WidthChoices,
} from "@plugins/apps/plugins/prototypes/plugins/compare/web";

/**
 * The standard breakpoints a whole screen is read at. Merged with the
 * prototype's own declared width, which is always offered: it is the width the
 * mock was drawn at, so the one width both halves are certain to have
 * something to say about. The breakpoints are what make the real app's own
 * responsive behavior legible beside it.
 */
const ROUTE_WIDTHS = [480, 768, 1024, 1280, 1600] as const;

function widthChoices(declared: number): WidthChoices {
  const all = [...new Set([...ROUTE_WIDTHS, declared])].sort((a, b) => a - b);
  const [first, ...rest] = all;
  // `all` holds `declared` at minimum, so the list is never empty.
  return first === undefined ? [declared] : [first, ...rest];
}

/**
 * The `route:` kind: the running app itself, framed at an in-app path.
 *
 * The frame loads THIS deploy's own origin, chromeless (`?embed=1`: no app
 * rail, no tab bar), so what sits beside the mock is the real screen as this
 * branch renders it — real routing, real live data, real chrome inside the
 * surface — and never a second implementation that could drift from it.
 */
export function RouteCounterpart({
  target,
  meta,
  children,
}: CounterpartKindProps): ReactElement {
  const apps = Apps.App.useContributions();
  const { deferredComplete } = useDeferredLoadState();
  return (
    <>{children(resolve(target, meta.viewport, apps, deferredComplete))}</>
  );
}

function resolve(
  target: string,
  viewport: { w: number; h: number },
  apps: ReturnType<typeof Apps.App.useContributions>,
  deferredComplete: boolean,
): CounterpartResolution {
  // Framing stops at depth one. This document being a framed app screen means
  // the path in some prototype led back to a Compare stage — its own
  // (`route:/prototypes/proto/<id>/compare`) or another one that leads back —
  // and framing again from here would nest app inside app with no floor.
  if (isEmbeddedDocument()) {
    return {
      status: "unresolved",
      title: "Not framing the app again inside a framed app screen.",
      detail:
        "This Compare stage is itself inside the app screen of another Compare stage, so its path leads back to a Compare stage. Framing stops at one level so the screens cannot nest without end.",
    };
  }

  if (!target.startsWith("/")) {
    return {
      status: "unresolved",
      title: (
        <>
          <Badge mono>{target}</Badge> is not an in-app path.
        </>
      ),
      detail:
        "A route counterpart is a root-relative path into this app, starting with a slash — the part of the address after the host, e.g. route:/agents.",
    };
  }

  // The path alone decides which pane answers; a query or hash rides along to
  // the frame untouched but is not part of the route.
  const pathname = new URL(target, "http://x").pathname;

  const resolved = resolveAppForPath(pathname, apps);
  if (resolved === undefined) {
    return {
      status: "unresolved",
      title: (
        <>
          No app in this worktree owns <Badge mono>{pathname}</Badge>.
        </>
      ),
      detail:
        "Every app owns a base path (/agents, /pages, …) and its screens live under it. Prototypes are shared by every worktree while apps are per-worktree code, so a prototype can name a path that only exists on another branch.",
    };
  }

  const parsed = parseUrl(resolved.routePath);
  if (parsed.status === "unresolved") {
    // The pane registry fills in as the deferred plugin tier loads, so an
    // unmatched path is not yet a missing one. "No pane at that path" would be
    // a claim that reverses itself a moment later.
    if (!deferredComplete) {
      return { status: "loading", label: "Loading the app's panes…" };
    }
    return {
      status: "unresolved",
      title: (
        <>
          <Badge mono>{resolved.app.app.name}</Badge> owns that prefix, but this
          worktree has no pane at <Badge mono>{pathname}</Badge>.
        </>
      ),
      detail:
        "The path matches no registered pane. Check it against the address bar when that screen is open.",
    };
  }

  return {
    status: "found",
    widths: widthChoices(viewport.w),
    title: "App screen",
    subtitle: resolved.app.app.name,
    badge: target,
    render: (width) => (
      <AppFrame target={target} width={width} height={viewport.h} />
    ),
  };
}

/**
 * The real app, in an iframe on this deploy's own origin.
 *
 * No `sandbox` attribute, on purpose. On a same-origin frame `allow-same-origin`
 * makes the sandbox a no-op as a boundary — the frame can reach the parent and
 * lift its own restrictions — while it silently withholds modals, popups,
 * downloads and forms, so a route that opens a picker would break only inside
 * this stage. Storage, BroadcastChannel and Web Locks are origin-keyed, so the
 * live-state cross-tab election treats the frame as one more document either
 * way. Nothing is gained and something is lost.
 *
 * No `?v=` cache-bust either: the counterpart is the live app, not a file on
 * disk, and a prototype edit must not reboot it.
 */
function AppFrame({
  target,
  width,
  height,
}: {
  target: string;
  width: number;
  height: number;
}): ReactElement {
  return (
    <iframe
      title={`App screen at ${target}`}
      src={embedUrl(target)}
      // Inline geometry, not banned className layout utilities: the width comes
      // from the frame's own box (100% of the width the stage sized it to), the
      // height from the prototype's declared viewport — the same box the mock
      // half gets, which is what makes the two comparable at all.
      style={{ border: "0", display: "block", width: "100%", height }}
      data-width={width}
    />
  );
}

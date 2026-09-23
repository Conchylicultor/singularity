import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { prototypesApp } from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import type { StoredPicks } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { PresentPage } from "./components/present-page";
import { LIVE_VERSION, encodePicks } from "./internal/present-link";

/**
 * `present/<id>/<version>[/<picks>]`:
 *
 * - `version` — a recorded version's sha, or `live` for the live folder. It is
 *   required rather than optional because a route may have only ONE optional
 *   part, and it must be the last: `picks` needs that place.
 * - `picks` — the frame's OWN picks (`a=b,c=d`), so a frame other than A opens
 *   on its variant. Absent, the page reads the shared picks record, as frame A
 *   does.
 */
export const prototypePresentRoute = defineRoute({
  id: "prototypes-present",
  segment: "present/:name/:version/:picks?",
});

/** The in-app path of one frame presented as a page of its own. */
export function presentPath({
  name,
  sha,
  picks,
}: {
  name: string;
  /** The recorded version on show — `undefined` for the live folder. */
  sha: string | undefined;
  /** The frame's own picks — `undefined` for frame A (the shared record). */
  picks: StoredPicks | undefined;
}): string {
  return prototypePresentRoute.link(prototypesApp, {
    name,
    version: sha ?? LIVE_VERSION,
    ...(picks === undefined ? {} : { picks: encodePicks(picks) }),
  });
}

/**
 * One frame presented as a page of its own: what the Present menu's new-tab
 * icons open — in a new app tab (inside the app, tab bar and all) or in a new
 * browser tab (chromeless, `?embed=1`). It draws the same stage as the in-app
 * presentations, options pill and size chip included.
 *
 * A root route, not a child of the gallery: opened alone it is the only column,
 * so it fills the surface.
 */
export const prototypePresentPane = Pane.define({
  route: prototypePresentRoute,
  app: prototypesApp,
  resolve: false,
  component: PresentPage,
  width: 720,
});

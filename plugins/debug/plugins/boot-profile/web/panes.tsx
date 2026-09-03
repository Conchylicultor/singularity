import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BootProfileLive } from "./components/boot-profile-live";
import { BootProfileDetail } from "./components/boot-profile-detail";
import { BootProfileList } from "./components/boot-profile-list";

// Live pane (/debug/boot-profile): the current tab's boot, read from the
// in-memory store, with the Refresh / Reload / Copy permalink controls.
const bootProfileRoute = defineRoute({
  id: "debug-boot-profile",
  segment: "boot-profile",
});

export const bootProfilePane = Pane.define({
  route: bootProfileRoute,
  app: debugApp,
  component: BootProfileBody,
});

function BootProfileBody() {
  return (
    <PaneChrome pane={bootProfilePane} title="Boot Profile">
      <BootProfileLive />
    </PaneChrome>
  );
}

// Detail pane (/debug/boot-profile/<id>): a saved snapshot re-rendered through
// the same pure Gantt. A static prefix precedes the :id param (segment grammar).
const bootProfileDetailRoute = defineRoute({
  id: "debug-boot-profile-detail",
  segment: "boot-profile/:id",
  parent: bootProfileRoute,
});

export const bootProfileDetailPane = Pane.define({
  route: bootProfileDetailRoute,
  app: debugApp,
  resolve: false,
  component: BootProfileDetailBody,
});

function BootProfileDetailBody() {
  const { id } = bootProfileDetailPane.useParams();
  return (
    <PaneChrome pane={bootProfileDetailPane} title="Saved Boot Profile">
      <BootProfileDetail id={id} />
    </PaneChrome>
  );
}

// Browse pane (Debug → Boot Profiles): the list of saved snapshots.
const bootProfileListRoute = defineRoute({
  id: "debug-boot-profiles-list",
  segment: "boot-profiles",
});

export const bootProfileListPane = Pane.define({
  route: bootProfileListRoute,
  app: debugApp,
  component: BootProfileListBody,
});

function BootProfileListBody() {
  return (
    <PaneChrome pane={bootProfileListPane} title="Boot Profiles">
      <BootProfileList />
    </PaneChrome>
  );
}

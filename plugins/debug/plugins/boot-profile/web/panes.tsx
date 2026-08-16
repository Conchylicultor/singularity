import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BootProfileLive } from "./components/boot-profile-live";
import { BootProfileDetail } from "./components/boot-profile-detail";
import { BootProfileList } from "./components/boot-profile-list";

// Live pane (/debug/boot-profile): the current tab's boot, read from the
// in-memory store, with the Refresh / Reload / Copy permalink controls.
export const bootProfilePane = Pane.define({
  id: "debug-boot-profile",
  app: debugApp,
  segment: "boot-profile",
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
export const bootProfileDetailPane = Pane.define({
  id: "debug-boot-profile-detail",
  app: debugApp,
  segment: "boot-profile/:id",
  defaultAncestors: [bootProfilePane],
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
export const bootProfileListPane = Pane.define({
  id: "debug-boot-profiles-list",
  app: debugApp,
  segment: "boot-profiles",
  component: BootProfileListBody,
});

function BootProfileListBody() {
  return (
    <PaneChrome pane={bootProfileListPane} title="Boot Profiles">
      <BootProfileList />
    </PaneChrome>
  );
}

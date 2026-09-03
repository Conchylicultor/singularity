import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BuildProfileDetailBody } from "./components/build-detail";

const buildProfileDetailRoute = defineRoute({
  id: "debug-profiling-build-detail",
  segment: "build-profile/:worktree/:buildId",
});

export const buildProfileDetailPane = Pane.define({
  route: buildProfileDetailRoute,
  app: debugApp,
  component: BuildProfileDetailBody,
  resolve: false,
});

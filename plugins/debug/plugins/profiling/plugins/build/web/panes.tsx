import { Pane } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BuildProfileDetailBody } from "./components/build-detail";

export const buildProfileDetailPane = Pane.define({
  id: "debug-profiling-build-detail",
  app: debugApp,
  segment: "build-profile/:worktree/:buildId",
  component: BuildProfileDetailBody,
  resolve: false,
});

import { Pane } from "@plugins/primitives/plugins/pane/web";
import { BuildProfileDetailBody } from "./components/build-detail";

export const buildProfileDetailPane = Pane.define({
  id: "debug-profiling-build-detail",
  segment: "build-profile/:worktree/:buildId",
  component: BuildProfileDetailBody,
  resolve: false,
});

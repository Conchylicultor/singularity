import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { stripAttemptBranchPrefix } from "@plugins/infra/plugins/worktree/core";
import { BuildProfileDetailBody } from "./components/build-detail";

export const buildProfileDetailPane = Pane.define({
  route: defineRoute({
    id: "debug-profiling-build-detail",
    segment: "build-profile/:worktree/:buildId",
  }),
  app: debugApp,
  title: {
    text: ({ worktree }) => `Build · ${stripAttemptBranchPrefix(worktree)}`,
  },
  component: BuildProfileDetailBody,
  resolve: false,
});

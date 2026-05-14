import { defineResource } from "@server/resources";
import { refHeadResource } from "@plugins/infra/plugins/git-watcher/server";
import { MainAheadCountSchema } from "../../shared";
import { getMainAheadCount } from "./git-status";

// Cascaded off the git-watcher's `refHeadResource`: every advance of
// `refs/heads/main` notifies us, the loader recomputes the count against
// `web/dist/.build-commit`, and the toolbar dot updates immediately.
export const mainAheadCountResource = defineResource({
  key: "build.mainAheadCount",
  mode: "push",
  schema: MainAheadCountSchema,
  dependsOn: [
    {
      resource: refHeadResource,
      map: (params: { refName: string }) =>
        params.refName === "refs/heads/main" ? [{}] : [],
    },
  ],
  loader: async () => ({ count: await getMainAheadCount() }),
});

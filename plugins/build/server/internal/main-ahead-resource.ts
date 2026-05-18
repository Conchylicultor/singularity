import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { refHeadResource } from "@plugins/infra/plugins/git-watcher/server";
import { MainAheadCountSchema } from "../../shared";
import { getMainAheadCount } from "./git-status";
import { buildHistoryResource } from "./build-history-resource";

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
    { resource: buildHistoryResource },
  ],
  loader: async () => ({ count: await getMainAheadCount() }),
});

import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { refHeadResource } from "@plugins/infra/plugins/git-watcher/server";
import { mainAheadCountResource as mainAheadCountDescriptor } from "../../shared";
import { getMainAhead } from "./git-status";

export const mainAheadCountResource = defineResource(mainAheadCountDescriptor, {
  mode: "push",
  dependsOn: [
    {
      resource: refHeadResource,
      map: (params: { refName: string }) =>
        params.refName === "refs/heads/main" ? [{}] : [],
    },
  ],
  loader: async () => getMainAhead(),
});

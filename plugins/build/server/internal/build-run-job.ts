import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { readConfig } from "@plugins/config/server";
import { buildConfig } from "@plugins/build/shared";
import { isBuildInflight, triggerBuild } from "./run-build";
import { setLastAutoBuildAt } from "./auto-build-tracker";

export const buildRunJob = defineJob({
  name: "build.run",
  input: z.object({}),
  event: z.never(),
  run: async () => {
    if (isBuildInflight()) return;
    const { autoBuild } = await readConfig(buildConfig);
    if (!autoBuild) return;
    setLastAutoBuildAt(new Date().toISOString());
    triggerBuild("auto");
  },
});

import { defineResource } from "@server/resources";
import { RefHeadSchema } from "../../shared/types";
import { readSha } from "./read-sha";

type Params = { refName: string };

export const refHeadResource = defineResource<{ sha: string | null }, Params>({
  key: "git-watcher.refHead",
  mode: "push",
  schema: RefHeadSchema,
  loader: async ({ refName }) => ({ sha: await readSha(refName) }),
});

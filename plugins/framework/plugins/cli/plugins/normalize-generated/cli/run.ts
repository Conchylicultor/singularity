import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { normalizeGeneratedArtifacts } from "@plugins/framework/plugins/cli/plugins/git-artifacts/cli";

const run: CliAction<[], object> = async () => {
  await normalizeGeneratedArtifacts(await getWorktreeRoot());
};

export default run;

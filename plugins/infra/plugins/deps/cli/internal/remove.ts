import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { declaredDep, removeDep } from "../../deps";

// No backend boot: the declarations are a generated registry, read directly.
const run: CliAction<[string], object> = async (id) => {
  const outcome = await removeDep(await declaredDep(id));
  switch (outcome.kind) {
    case "removed":
      console.log(`${id}: removed (${(outcome.bytes / 1e6).toFixed(1)} MB)`);
      return;
    case "absent":
      console.log(`${id}: nothing installed at its current identity`);
      return;
    case "busy":
      throw new Error(
        `${id} is being installed (or swept) right now; remove it once that finishes.`,
      );
  }
};

export default run;

import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { inThisCheckout } from "./exec";

const run: CliAction<[string], object> = (id) =>
  inThisCheckout(async () => {
    // After the boot: a server barrel evaluates config that needs the
    // runtime namespace `runExec` declares.
    const { declaredDep, removeDep } =
      await import("@plugins/infra/plugins/deps/server");
    const outcome = await removeDep(declaredDep(id));
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
  });

export default run;

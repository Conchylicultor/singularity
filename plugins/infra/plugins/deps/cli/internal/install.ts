import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { inThisCheckout } from "./exec";

const run: CliAction<[string], object> = (id) =>
  inThisCheckout(async (exec) => {
    // After the boot: a server barrel evaluates config that needs the
    // runtime namespace `runExec` declares.
    const { declaredDep, ensureDep } =
      await import("@plugins/infra/plugins/deps/server");
    const started = Date.now();
    const ready = await ensureDep(declaredDep(id), exec, {
      log: (line) => console.log(line),
    });
    console.log(
      `${id} ready at ${ready.identity} (${ready.dir}) in ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  });

export default run;

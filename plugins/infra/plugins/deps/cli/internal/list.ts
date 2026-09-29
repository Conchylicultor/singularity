import type { CliAction } from "@plugins/framework/plugins/cli/core";
import type { DepState } from "../../core";
import { inThisCheckout } from "./exec";

function describe(state: DepState): string {
  switch (state.kind) {
    case "absent":
      return "absent";
    case "installing":
      return `installing since ${state.since}`;
    case "ready":
      return `ready ${state.identity} ${(state.bytes / 1e6).toFixed(1)} MB, last used ${state.lastUsed ?? "never"}`;
    case "failed":
      return `failed at ${state.at}: ${state.message.split("\n")[0]}`;
  }
}

const run: CliAction<[], object> = () =>
  inThisCheckout(async () => {
    // After the boot: a server barrel evaluates config that needs the
    // runtime namespace `runExec` declares.
    const { declaredDeps, depState } =
      await import("@plugins/infra/plugins/deps/server");
    const deps = declaredDeps();
    if (deps.length === 0) {
      console.log("No dependency is declared in this checkout.");
      return;
    }
    for (const dep of deps) {
      const state = await depState(dep);
      console.log(
        `${dep.id}  [${dep.source.kind}: ${dep.source.label}]  ${dep.sizeHint}\n  ${describe(state)}`,
      );
    }
  });

export default run;

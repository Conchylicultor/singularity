import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { inThisCheckout } from "./exec";
import type { FeaturesOptions } from "./features-body";

const run: CliAction<[string[]], FeaturesOptions> = (ids, opts) =>
  inThisCheckout(async (exec) => {
    // Loaded after the boot has declared the runtime namespace.
    const { features } = await import("./features-body");
    await features(ids, opts, exec);
  });

export default run;

import { runtimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";
import { configDir } from "../../data-dirs";

/**
 * This namespace's subtree of the declared user-config directory.
 *
 * Resolved at MODULE EVAL, which is why `bin/index.ts` declares the runtime
 * namespace in its very first statement: without one this throws, and the throw
 * arrives from whichever of the 80-odd plugins importing `ConfigV2` got here
 * first — as a `Cannot access 'ConfigV2' before initialization` TDZ error that
 * says nothing about the real cause.
 */
export const CONFIG_DIR = configDir.file(runtimeNamespace());

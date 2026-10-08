import {
  persistedDefinitions,
  persistedKeys,
} from "@plugins/framework/plugins/server-core/core";
import type { L2Expectation } from "./persist";

/**
 * The running backend's usable-row expectation (see `L2Expectation`): the keys
 * the runtime persists right now and their definitions, read at call time —
 * after the hooks are installed (`persistedKeys()` reads `shouldPersist`
 * through them) and after the deferred resources bound their plans.
 */
export function l2Expectation(): L2Expectation {
  return {
    persisted: persistedKeys(),
    definitions: persistedDefinitions(),
  };
}

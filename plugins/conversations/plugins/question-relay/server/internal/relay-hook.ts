import { existsSync } from "node:fs";
import { join } from "node:path";
import { questionRelayHook, type RelayHookEntry } from "../../core/hook";

// The relay script beside THIS code — the checkout serving the endpoints it
// calls — resolved from the module, so it needs no git root and follows a move.
const RELAY_SCRIPT = join(import.meta.dir, "../../bin/ask-relay.ts");

/**
 * The PreToolUse hook entry an agent launch merges into its settings. Throws
 * when the script is missing: a launch must not install a hook that cannot run.
 */
export function relayHookEntry(): RelayHookEntry {
  if (!existsSync(RELAY_SCRIPT)) {
    throw new Error(`question relay script missing at ${RELAY_SCRIPT}`);
  }
  return questionRelayHook({ scriptPath: RELAY_SCRIPT });
}

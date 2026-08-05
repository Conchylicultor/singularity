import { TaskLaunchServer } from "./contribution";

/**
 * Copy every inheritable launch option from a spawning task onto a task it
 * spawned. THE read of the inherit verb: consumers name no option, so an option
 * added later is inherited with no edit here or at any call site — which is the
 * drift this replaced (one MCP tool inherited preprompt + effort, the other only
 * preprompt, so agent-filed tasks silently lost their thinking mode).
 *
 * Sequential, and errors propagate: a failed inherit is a real failure, not a
 * setting to drop. An option with no `inherit` is skipped — that absence is its
 * declaration that it is not inherited.
 */
export async function inheritLaunchOptions(
  fromTaskId: string,
  toTaskId: string,
): Promise<void> {
  for (const entry of TaskLaunchServer.getContributions()) {
    await entry.inherit?.(fromTaskId, toTaskId);
  }
}

import { getConfig } from "@plugins/config_v2/server";
import { prepromptsConfig } from "../../shared/config";

/**
 * Resolve a preprompt id (a config list-item UUID) to its prompt text.
 * Returns undefined when the id is absent, no longer present in the config
 * (e.g. the preprompt was deleted), or resolves to empty text — callers omit
 * `--append-system-prompt` entirely in that case (fail-soft, never crashes a
 * launch over a dangling reference).
 */
export function resolvePreprompt(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const { preprompts } = getConfig(prepromptsConfig);
  const item = preprompts.find((p) => p.id === id);
  const text = item?.prompt.trim();
  return text ? text : undefined;
}

import { getConfig } from "@plugins/config_v2/server";
import { prepromptsConfig } from "../../shared/config";

/**
 * Resolve a preprompt id (a config list-item UUID) to its full config item
 * (id, title, trimmed prompt). Returns undefined when the id is absent, no
 * longer present in the config (e.g. the preprompt was deleted), or resolves
 * to empty text — callers fail-soft over a dangling reference.
 */
export function resolvePrepromptItem(
  id: string | null | undefined,
): { id: string; title: string; prompt: string } | undefined {
  if (!id) return undefined;
  const { preprompts } = getConfig(prepromptsConfig);
  const item = preprompts.find((p) => p.id === id);
  if (!item) return undefined;
  const prompt = item.prompt.trim();
  if (!prompt) return undefined;
  return { id: item.id, title: item.title, prompt };
}

/**
 * Resolve a preprompt id to its prompt text. Returns undefined when the id is
 * absent, deleted, or resolves to empty text — callers inject nothing into the
 * first user turn in that case (fail-soft, never crashes a launch over a
 * dangling reference).
 */
export function resolvePreprompt(id: string | null | undefined): string | undefined {
  return resolvePrepromptItem(id)?.prompt;
}

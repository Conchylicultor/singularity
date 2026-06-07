import { useConfig } from "@plugins/config_v2/web";
import { prepromptsConfig } from "../../shared/config";

/**
 * Live lookup of a single preprompt from the config library by id. Reactive —
 * re-renders when the library changes (e.g. an icon is added/edited later), so
 * consumers track the current definition rather than a stale copy. Returns
 * `null` for an unset id or one that no longer exists (deleted preprompt).
 *
 * The owner-provided read API for the library: consumers look up by id through
 * this hook instead of reaching into the config descriptor themselves.
 */
export function usePreprompt(id: string | null) {
  const { preprompts } = useConfig(prepromptsConfig);
  if (!id) return null;
  return preprompts.find((p) => p.id === id) ?? null;
}

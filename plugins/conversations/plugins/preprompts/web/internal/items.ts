import { useConfig } from "@plugins/config_v2/web";
import type { AvatarSpec } from "@plugins/fields/plugins/avatar/core";
import { prepromptsConfig } from "../../shared/config";

/** One configured preprompt, as a menu/list row. */
export interface PrepromptItem {
  value: string;
  label: string;
  /**
   * The preprompt's icon spec, kept as data so a row can draw it with
   * `PrepromptGlyph` — which renders its own default glyph when there is none,
   * so a preprompt is always visibly marked.
   */
  icon: AvatarSpec | null | undefined;
}

/**
 * The configured preprompts as rows, in library order — the one reader shared
 * by the surfaces that draw a preprompt list, so none of them reaches into the
 * config descriptor itself. Reactive: editing the library re-renders them.
 */
export function usePrepromptItems(): PrepromptItem[] {
  const { preprompts } = useConfig(prepromptsConfig);
  return preprompts.map((p) => ({
    value: p.id,
    label: p.title || "Untitled",
    icon: p.icon,
  }));
}

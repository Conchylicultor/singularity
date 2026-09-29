import type { JsonValue } from "@plugins/config_v2/core";
import { symbolNameForClassic } from "@plugins/primitives/plugins/icon-picker/core";
import { isSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";

/**
 * One saved avatar value (`{ icon, color, svgNodes? }`) in the Material Symbols
 * shape: a classic Material Icons key (`star_outline`) becomes the symbol that
 * draws it (`star`), and the stored `svgNodes` drawing is dropped — `<Icon>`
 * draws the name now. Idempotent: an avatar already holding a symbol name
 * comes back unchanged. A value that is neither (hand-edited garbage) is
 * cleared, with a warning, rather than failing the whole config's parse.
 *
 * For a config's `defineConfigMigration` whose fields hold `avatarField`s.
 */
export function migrateClassicAvatar(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const { svgNodes: _drawing, ...rest } = value;
  const icon = rest.icon;
  if (typeof icon !== "string" || isSavedSymbolName(icon)) return rest;
  const mapped = symbolNameForClassic(icon);
  if (mapped === undefined) {
    console.warn(
      `[avatar] saved icon "${icon}" is neither a classic Material Icons key nor a Material Symbols name — cleared`,
    );
  }
  return { ...rest, icon: mapped ?? null };
}

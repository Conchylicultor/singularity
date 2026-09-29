import type { SavedSymbolName } from "@plugins/ui/plugins/icons/core";
import { parseSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { CLASSIC_SYMBOL_NAMES } from "./classic-symbol-names";

/**
 * The Material Symbols name a classic Material Icons key (`add_circle_outline`)
 * is drawn by now (`add-circle`), or `undefined` for a string that is not a
 * classic key. For migrating what was saved before the move — nothing new is
 * ever stored under a classic key.
 */
export function symbolNameForClassic(key: string): SavedSymbolName | undefined {
  const name = Object.hasOwn(CLASSIC_SYMBOL_NAMES, key)
    ? CLASSIC_SYMBOL_NAMES[key]
    : undefined;
  return name === undefined ? undefined : parseSavedSymbolName(name);
}

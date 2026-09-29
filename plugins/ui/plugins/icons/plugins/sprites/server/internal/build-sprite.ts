import type { IconifyJSON } from "@iconify/types";
import { resolveIcon } from "@plugins/ui/plugins/icons/server";

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** One `<symbol id viewBox>` drawing the Iconify icon `iconifyName` of `set`. */
export function buildSymbol(entry: {
  id: string;
  set: IconifyJSON;
  iconifyName: string;
}): string {
  const { body, width, height } = resolveIcon(entry.set, entry.iconifyName);
  return `<symbol id="${escapeAttr(entry.id)}" viewBox="0 0 ${width} ${height}">${body}</symbol>`;
}

/** A hidden `<svg>` holding already-built `<symbol>`s. */
export function wrapSprite(symbols: readonly string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>`;
}

/**
 * One sprite: a hidden `<svg>` holding a `<symbol id viewBox>` per entry. Each
 * entry names its sprite id and the Iconify icon (in which set) drawn under
 * it — for a symbol, the style's own drawing or its nearest fallback.
 */
export function buildSprite(
  entries: readonly { id: string; set: IconifyJSON; iconifyName: string }[],
): string {
  return wrapSprite(entries.map(buildSymbol));
}

import type { IconifyJSON } from "@iconify/types";
import { resolveIcon } from "@plugins/ui/plugins/icons/server";

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * One sprite: a hidden `<svg>` holding a `<symbol id viewBox>` per entry. Each
 * entry names its sprite id and the Iconify icon (in which set) drawn under
 * it — for a symbol, the style's own drawing or its nearest fallback.
 */
export function buildSprite(
  entries: readonly { id: string; set: IconifyJSON; iconifyName: string }[],
): string {
  const symbols = entries.map(({ id, set, iconifyName }) => {
    const { body, width, height } = resolveIcon(set, iconifyName);
    return `<symbol id="${escapeAttr(id)}" viewBox="0 0 ${width} ${height}">${body}</symbol>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>`;
}

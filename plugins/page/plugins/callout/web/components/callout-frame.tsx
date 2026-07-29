import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { calloutBlock } from "../../core";
import { COLOR_BG } from "./callout-colors";

/**
 * The callout's tinted box, covering the callout's own line AND every block
 * nested inside it — the callout is a CONTAINER: it supplies the box, the blocks
 * within supply the content, and they may be of any type.
 *
 * This is a BACKDROP, not a wrapper (see `BlockFrameProps`): it takes no
 * children and is painted behind the rows it covers, which is what lets a block
 * be indented into or out of a callout without its editor remounting.
 *
 * It fills the positioned box the surface hands it via `absolute` insets rather
 * than `h-full`: an explicit height would defeat the editor's grid stretch.
 *
 * - `left: inset` — the callout's content edge, so the tint never covers the
 *   editor's hover rail (0 on surfaces with no rail).
 * - `inset-y-0` — the box covers exactly the rows it spans. It deliberately does
 *   NOT bleed past them for extra breathing room: a backdrop cannot displace a
 *   neighbour the way a padded wrapper could, so a bleed would simply overlap
 *   the next block. None is needed anyway — every row already carries its own
 *   `py-xs`, so the tint sits a comfortable gap away from the text inside it.
 *
 * `data` may be transient mid-edit, so the color is read defensively; an
 * unparseable payload still gets a box, just the default tint.
 */
export function CalloutFrame({ data, inset }: BlockFrameProps) {
  const parsed = calloutBlock.safeParse(data);
  const color = parsed.success ? parsed.data.color : "default";
  return (
    <div
      // eslint-disable-next-line layout/no-adhoc-layout -- a backdrop filling the surface-provided positioned box, offset by a JS-computed left inset; not a ramp-expressible anchor
      className={cn("absolute rounded-md", COLOR_BG[color])}
      style={{ left: inset, right: 0, top: 0, bottom: 0 }}
    />
  );
}

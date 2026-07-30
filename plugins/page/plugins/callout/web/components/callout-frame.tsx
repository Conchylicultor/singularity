import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";
import { calloutBlock } from "../../core";
import { COLOR_BG } from "./callout-colors";

/**
 * The callout's tinted box, covering the callout's own line AND every block
 * nested inside it — the callout is a CONTAINER: it supplies the box, the blocks
 * within supply the content, and they may be of any type.
 *
 * `ContainerBackdrop` owns the geometry (an `absolute` box filling the
 * surface-provided positioned box from `inset`, never `h-full`, no horizontal
 * offset of its own) so this file declares nothing but the tint.
 *
 * `data` may be transient mid-edit, so the color is read defensively; an
 * unparseable payload still gets a box, just the default tint.
 */
export function CalloutFrame({ data, inset }: BlockFrameProps) {
  const parsed = calloutBlock.safeParse(data);
  const color = parsed.success ? parsed.data.color : "default";
  return <ContainerBackdrop inset={inset} className={cn("rounded-md", COLOR_BG[color])} />;
}

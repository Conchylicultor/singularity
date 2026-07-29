import { MdLightbulb } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { PageIcon, type BlockAnchorProps } from "@plugins/page/plugins/editor/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { calloutBlock, type CalloutColor } from "../../core";
import { CalloutIcon } from "./callout-icon";
import { COLOR_TEXT } from "./callout-colors";

/**
 * The callout's `Editor.Block` renderer — deliberately paints nothing.
 *
 * `BlockRow`'s anchored branch never dispatches `Editor.Block` for a type
 * declaring `anchor: true`: the row has no line, so there is nothing for a block
 * renderer to render. The registration it hangs off is still required — it is
 * where the HANDLE lives, and the handle is what the insert palette, markdown,
 * paste, the turn-into list and the reducer's `anchorTypes` all read. The row's
 * paint comes from `CalloutAnchor` below, via the frame contribution.
 */
export function CalloutNoRow() {
  return null;
}

/** The callout's appearance, read defensively — `data` can be transient mid-edit. */
function appearance(data: unknown): {
  icon: string | null;
  iconSvgNodes: SvgNode[] | null;
  color: CalloutColor;
} {
  const parsed = calloutBlock.safeParse(data);
  if (parsed.success) return parsed.data;
  // An unparseable payload still gets a glyph, just the default one — exactly as
  // `CalloutFrame` still paints a box in the default tint.
  return { icon: null, iconSvgNodes: null, color: "default" };
}

/**
 * The callout's leading glyph — the ONLY thing its row paints.
 *
 * The callout is a void container ANCHOR: it renders no line of its own, so its
 * row collapses to zero height and the surface mounts this component in a
 * `BLOCK_INDENT`-wide column at the container's content edge `C`, seated on its
 * first visible child's first line. This renders appearance + interaction only —
 * it must not position or size itself (see `BlockAnchorProps`).
 *
 * Two surfaces, one contribution:
 *
 * - **Editable** (`editor` present) → `CalloutIcon`, whose popover carries the
 *   container's WHOLE affordance set (colour, icon, reset, remove-callout,
 *   delete). An anchor row has no hover rail to hang a block-actions menu off,
 *   so there is nowhere else for those to live.
 * - **Read-only** (`editor` absent: the blog renderer, a version-history
 *   preview) → a static glyph. Rendering a dead control there would be worse
 *   than rendering none.
 */
export function CalloutAnchor({ id, data, editor }: BlockAnchorProps) {
  const { icon, iconSvgNodes, color } = appearance(data);

  if (!editor) {
    return (
      <Center className="w-full">
        <PageIcon
          nodes={iconSvgNodes}
          fallback={MdLightbulb}
          className={cn("size-5", COLOR_TEXT[color])}
        />
      </Center>
    );
  }

  return (
    <CalloutIcon
      blockId={id}
      color={color}
      icon={icon}
      iconSvgNodes={iconSvgNodes}
      editor={editor}
      onChange={(next) => editor.update({ icon, iconSvgNodes, color, ...next })}
      className={COLOR_TEXT[color]}
    />
  );
}

import { MdLightbulb } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { PageIcon, type BlockAnchorProps } from "@plugins/page/plugins/editor/web";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { calloutBlock, type CalloutColor } from "../../core";
import { CalloutAppearance } from "./callout-appearance";
import { COLOR_TEXT } from "./callout-colors";

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
 * Everything structural about an anchor decoration (the static-vs-interactive
 * branch on `editor`, the `preventDefault`ed trigger, the popover, and its
 * Remove-callout / Delete actions) belongs to every void container, so it comes
 * from `ContainerAnchor`. What is genuinely the callout's own is what this file
 * supplies: the glyph and the appearance sections above those actions.
 *
 * `width="xl"` because the sections host the full icon picker; the shell's
 * default suits a menu of the two structural actions alone.
 */
export function CalloutAnchor({ id, data, editor }: BlockAnchorProps) {
  const { icon, iconSvgNodes, color } = appearance(data);

  return (
    <ContainerAnchor
      id={id}
      editor={editor}
      name="callout"
      triggerLabel="Callout icon and color"
      width="xl"
      glyph={
        <PageIcon
          nodes={iconSvgNodes}
          fallback={MdLightbulb}
          className={cn("size-5", COLOR_TEXT[color])}
        />
      }
      sections={({ editor: api, close }) => (
        <CalloutAppearance
          color={color}
          icon={icon}
          onChange={(next) => api.update({ icon, iconSvgNodes, color, ...next })}
          close={close}
        />
      )}
    />
  );
}

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { BLOCK_INSET, BlockTextEditor, type BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { calloutBlock, type CalloutColor } from "../../core";
import { CalloutIcon } from "./callout-icon";

/** Tinted background per semantic color (theme tokens). */
const COLOR_BG: Record<CalloutColor, string> = {
  default: "bg-muted",
  info: "bg-info/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
  danger: "bg-destructive/15",
};

/** Icon color per semantic color (theme tokens). */
const COLOR_TEXT: Record<CalloutColor, string> = {
  default: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/**
 * Notion-style callout: a tinted box wrapping the shared block text editor with
 * an interactive leading icon. The icon is passed as the editor's `marker` so it
 * sits left of the text and top-aligns with the first line.
 */
export function CalloutBlock({ block, isFocused, editor }: BlockRendererProps) {
  const data = calloutBlock.parse(block.data);
  return (
    <Inset x={BLOCK_INSET} y="xs">
      <div className={cn("rounded-md", COLOR_BG[data.color])}>
        <BlockTextEditor
          block={block}
          isFocused={isFocused}
          editor={editor}
          textVariant="body"
          // The tinted box already supplies the left inset; don't stack the
          // page rail inset on top of it.
          inset={false}
          marker={
            <CalloutIcon
              color={data.color}
              icon={data.icon}
              iconSvgNodes={data.iconSvgNodes}
              onChange={(next) => editor.update({ ...data, ...next })}
              className={COLOR_TEXT[data.color]}
            />
          }
          placeholder="Type something…"
        />
      </div>
    </Inset>
  );
}

import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const formatStrikethroughIcon = symbol("format-strikethrough");

/** Strikethrough mark toggle for the selection toolbar. */
export function StrikethroughButton() {
  return (
    <MarkButton
      mark="strikethrough"
      icon={formatStrikethroughIcon}
      label="Strikethrough"
      shortcutHint={<Kbd>⌘⇧X</Kbd>}
    />
  );
}

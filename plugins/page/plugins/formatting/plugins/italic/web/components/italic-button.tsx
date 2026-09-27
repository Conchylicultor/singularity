import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const formatItalicIcon = symbol("format-italic");

/** Italic mark toggle for the selection toolbar. */
export function ItalicButton() {
  return (
    <MarkButton
      mark="italic"
      icon={formatItalicIcon}
      label="Italic"
      shortcutHint={<Kbd>⌘I</Kbd>}
    />
  );
}

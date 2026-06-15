import { MdFormatStrikethrough } from "react-icons/md";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";

/** Strikethrough mark toggle for the selection toolbar. */
export function StrikethroughButton() {
  return (
    <MarkButton
      mark="strikethrough"
      icon={MdFormatStrikethrough}
      label="Strikethrough"
      shortcutHint={<Kbd>⌘⇧X</Kbd>}
    />
  );
}

import { MdFormatItalic } from "react-icons/md";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";

/** Italic mark toggle for the selection toolbar. */
export function ItalicButton() {
  return (
    <MarkButton mark="italic" icon={MdFormatItalic} label="Italic" shortcutHint={<Kbd>⌘I</Kbd>} />
  );
}

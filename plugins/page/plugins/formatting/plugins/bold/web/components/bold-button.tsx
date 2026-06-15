import { MdFormatBold } from "react-icons/md";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";

/** Bold mark toggle for the selection toolbar. */
export function BoldButton() {
  return (
    <MarkButton mark="bold" icon={MdFormatBold} label="Bold" shortcutHint={<Kbd>⌘B</Kbd>} />
  );
}

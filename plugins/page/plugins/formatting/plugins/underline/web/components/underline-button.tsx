import { MdFormatUnderlined } from "react-icons/md";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";

/** Underline mark toggle for the selection toolbar. */
export function UnderlineButton() {
  return (
    <MarkButton
      mark="underline"
      icon={MdFormatUnderlined}
      label="Underline"
      shortcutHint={<Kbd>⌘U</Kbd>}
    />
  );
}

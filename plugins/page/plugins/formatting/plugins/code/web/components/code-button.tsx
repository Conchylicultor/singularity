import { MdCode } from "react-icons/md";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";

/** Inline-code mark toggle for the selection toolbar. */
export function CodeButton() {
  return <MarkButton mark="code" icon={MdCode} label="Code" shortcutHint={<Kbd>⌘E</Kbd>} />;
}

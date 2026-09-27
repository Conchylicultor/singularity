import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const formatUnderlinedIcon = symbol("format-underlined");

/** Underline mark toggle for the selection toolbar. */
export function UnderlineButton() {
  return (
    <MarkButton
      mark="underline"
      icon={formatUnderlinedIcon}
      label="Underline"
      shortcutHint={<Kbd>⌘U</Kbd>}
    />
  );
}

import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const formatBoldIcon = symbol("format-bold");

/** Bold mark toggle for the selection toolbar. */
export function BoldButton() {
  return (
    <MarkButton
      mark="bold"
      icon={formatBoldIcon}
      label="Bold"
      shortcutHint={<Kbd>⌘B</Kbd>}
    />
  );
}

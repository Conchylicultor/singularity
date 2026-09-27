import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { MarkButton } from "@plugins/page/plugins/editor/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const codeIcon = symbol("code");

/** Inline-code mark toggle for the selection toolbar. */
export function CodeButton() {
  return (
    <MarkButton
      mark="code"
      icon={codeIcon}
      label="Code"
      shortcutHint={<Kbd>⌘E</Kbd>}
    />
  );
}

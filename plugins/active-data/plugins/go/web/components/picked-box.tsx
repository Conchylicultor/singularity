import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";

/**
 * A picked checklist line's tick — the same checked box the agent's checklist
 * rows draw, sitting in the text run (in the draft and in the sent message).
 */
export function PickedBox() {
  return (
    <Inline gap="none" className="select-none pr-xs align-middle">
      <CheckboxIndicator checked />
    </Inline>
  );
}

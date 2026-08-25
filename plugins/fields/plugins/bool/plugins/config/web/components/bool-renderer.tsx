import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { boolFieldType } from "@plugins/fields/plugins/bool/core";

/**
 * A boolean IS the switch — one of invariant #3's three selection languages —
 * so the shape says `toggle` and the panel draws the row, the indicator and the
 * label. This file used to draw a raw `<input type="checkbox">` with a hand-rolled
 * top offset, which is how one sonata panel ended up showing three different
 * ways of saying "on".
 */
const BoolRenderer = defineFieldShape({
  type: boolFieldType,
  useShape: ({ value, onChange }) => ({
    kind: "toggle",
    checked: value,
    onToggle: () => onChange(!value),
  }),
});

export { BoolRenderer };

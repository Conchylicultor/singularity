import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { jsonFieldType } from "@plugins/fields/plugins/json/core";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * Read-only. A `jsonField`'s value is app-written (e.g. the data-view saved-view
 * state), not hand-edited, so the control is the formatted JSON in a recessed,
 * scrollable, monospace box — wider than a row, hence a `block`. The reset
 * affordance is the host's, not this field's.
 */
const JsonRenderer = defineFieldShape({
  type: jsonFieldType,
  useShape: ({ value }) => ({
    kind: "block",
    control: (
      <Surface level="sunken" className="rounded-lg border border-border p-sm">
        <Scroll axis="both" className="max-h-64">
          <Text
            as="pre"
            variant="caption"
            tone="muted"
            className="font-mono whitespace-pre"
          >
            {JSON.stringify(value, null, 2)}
          </Text>
        </Scroll>
      </Surface>
    ),
  }),
});

export { JsonRenderer };

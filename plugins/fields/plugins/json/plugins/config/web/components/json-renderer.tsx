import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { jsonFieldType } from "@plugins/fields/plugins/json/core";

/**
 * Read-only renderer for a `jsonField`. The value is app-written (e.g. the
 * data-view saved-view state), not hand-edited, so the settings surface only
 * shows the formatted JSON in a recessed, scrollable, monospace box. The
 * standard reset affordance lives outside the renderer (provided by the
 * settings detail pane).
 */
const JsonRenderer: FieldRendererComponent<unknown> = ({ field, value }) => (
  <Stack gap="xs" className="py-md">
    <FieldHeader field={field} />
    <Surface
      level="sunken"
      className="max-h-64 overflow-auto rounded-lg border border-border p-sm"
    >
      <Text as="pre" variant="caption" tone="muted" className="font-mono whitespace-pre">
        {JSON.stringify(value, null, 2)}
      </Text>
    </Surface>
  </Stack>
);
JsonRenderer.type = jsonFieldType;

export { JsonRenderer };

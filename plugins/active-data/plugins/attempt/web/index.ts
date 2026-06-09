import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData } from "@plugins/active-data/web";
import { AttemptChip } from "./components/attempt-chip";
import { ATTEMPT_ID_RE } from "./internal/pattern";

export { AttemptChip };

export default {
  description:
    "Renders raw `att-<id>` strings inline as clickable chips that open the attempt pane. Models emit the bare id, no tag wrapping needed.",
  contributions: [ActiveData.Tag({ display: "inline", pattern: ATTEMPT_ID_RE, component: AttemptChip })],
} satisfies PluginDefinition;

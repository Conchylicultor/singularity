import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, inlineChip } from "@plugins/active-data/web";
import { ATTEMPT_ID_RE } from "../core";
import { AttemptChip } from "./components/attempt-chip";

export { AttemptChip };

export default {
  description:
    "Renders raw `att-<id>` strings inline as clickable chips named after the attempt's conversation, opening that conversation (the attempt pane when it has none). Models emit the bare id, no tag wrapping needed.",
  contributions: [
    ActiveData.Tag(
      inlineChip({
        id: "attempt",
        pattern: ATTEMPT_ID_RE,
        surfaces: ["transcript", "document"],
        component: AttemptChip,
      }),
    ),
  ],
} satisfies PluginDefinition;

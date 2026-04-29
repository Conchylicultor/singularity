import type { PluginDefinition } from "@core";
import { ActiveData } from "@plugins/active-data/web";
import { ConvChip } from "./components/conv-chip";

// Conversation IDs are formatted as `conv-<unix-seconds>-<4 base36 chars>` —
// see `plugins/conversations/server/internal/lifecycle.ts`. Word boundaries
// keep the pattern from biting into longer identifiers (e.g. `conv-xxx-extra`).
const CONV_ID_RE = /\bconv-\d+-[a-z0-9]{4}\b/g;

export default {
  id: "active-data-conv",
  name: "Active Data: conv chip",
  description:
    "Renders raw `conv-<id>` strings inline as clickable chips that open the referenced conversation in the right side pane alongside the host conversation. Models emit the bare id, no tag wrapping needed.",
  contributions: [ActiveData.Tag({ pattern: CONV_ID_RE, component: ConvChip })],
} satisfies PluginDefinition;

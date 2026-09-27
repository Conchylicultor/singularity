import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Browser } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { RecordVisits } from "./components/record-visits";

export { useRecordVisit } from "./internal/use-record-visit";
export { browserRecents, BrowserRecentSchema } from "../shared/resources";
export type { BrowserRecent } from "../shared/resources";

export default {
  description:
    "Browser history: a headless recorder that logs every navigation to the history store, plus the browserRecents live value (read with useLive).",
  contributions: [
    Browser.Effects({ id: "history-recorder", component: RecordVisits }),
  ],
} satisfies PluginDefinition;

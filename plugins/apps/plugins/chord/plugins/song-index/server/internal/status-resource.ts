import { serveValue } from "@plugins/network/plugins/live/server";
import { chordIndexStatus } from "../../core";
import { loadIndexStatus } from "./state";

// The index status, pushed. The load job writes its phase and progress to the
// one-row `chord_index_state` from its own process; the change feed carries each
// committed write to it (and to `chord_index_request`, the loader's other read)
// here, so the push needs no in-memory notify (which could not cross the process
// boundary anyway). One small value: a schema-bounded scalar.
export const chordIndexStatusServed = serveValue(chordIndexStatus, {
  source: "db",
  loader: () => loadIndexStatus(),
});

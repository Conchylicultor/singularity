import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { chordIndexStatusResource } from "../../core";
import { loadIndexStatus } from "./state";

// The index status, pushed. The load job writes its phase and progress to the
// one-row `chord_index_state` from its own process; the change feed carries each
// committed write here, so the push needs no in-memory notify (which could not
// cross the process boundary anyway). One small value: a schema-bounded scalar.
export const chordIndexStatusServerResource = defineResource(
  chordIndexStatusResource,
  {
    mode: "push",
    identityTable: "chord_index_state",
    loader: () => loadIndexStatus(),
  },
);

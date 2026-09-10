import { implement } from "@plugins/infra/plugins/endpoints/server";
import { setChordModeEndpoint } from "../../shared/endpoints";
import { songChordMode } from "./tables";

export const handleSetChordMode = implement(
  setChordModeEndpoint,
  async ({ params, body }) => {
    // Upsert the per-song flag. The FK to sonata_songs makes a write for a
    // non-existent song fail loudly.
    await songChordMode.upsert(params.id, { enabled: body.enabled });
  },
);

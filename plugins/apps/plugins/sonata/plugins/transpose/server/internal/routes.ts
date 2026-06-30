import { implement } from "@plugins/infra/plugins/endpoints/server";
import { setTransposeEndpoint } from "../../shared/endpoints";
import { songTranspose } from "./tables";

export const handleSetTranspose = implement(
  setTransposeEndpoint,
  async ({ params, body }) => {
    // Upsert the per-song offset. The FK to sonata_songs makes a write for a
    // non-existent song fail loudly.
    await songTranspose.upsert(params.id, { semitones: body.semitones });
  },
);

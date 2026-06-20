import { implement } from "@plugins/infra/plugins/endpoints/server";
import { setKeyAutoDetectEndpoint } from "../../shared/endpoints";
import { songKeyAutoDetect } from "./tables";

export const handleSetKeyAutoDetect = implement(
  setKeyAutoDetectEndpoint,
  async ({ params, body }) => {
    // Upsert the per-song override. The FK to sonata_songs makes a write for a
    // non-existent song fail loudly.
    await songKeyAutoDetect.upsert(params.id, { enabled: body.enabled });
  },
);

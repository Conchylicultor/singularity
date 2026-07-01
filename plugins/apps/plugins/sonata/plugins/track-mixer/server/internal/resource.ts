import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { trackViewResource } from "../../shared/resources";
import { trackView } from "./tables";

/** Push-mode rollup of every persisted track-view override. Selects only the
 * wire columns, so the server-only timestamps are never fetched. */
export const trackViewLiveResource = defineResource({
  key: trackViewResource.key,
  mode: "push",
  schema: z.array(trackView.schema),
  loader: async () => db.select(trackView.wireColumns).from(trackView.table),
});

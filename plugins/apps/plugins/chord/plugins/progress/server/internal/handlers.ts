import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { recordRoundEndpoint } from "../../core";
import { recordRound } from "./record";

export const handleRecordRound = implement(recordRoundEndpoint, ({ body }) =>
  recordRound(db, body),
);

import { implement } from "@plugins/infra/plugins/endpoints/server";
import { putTaskTrack } from "../../core";
import { setTaskTrack } from "./mutations";

export const handlePutTaskTrack = implement(
  putTaskTrack,
  async ({ params, body }) => {
    await setTaskTrack(params.taskId, body.track);
  },
);

import { implement } from "@plugins/infra/plugins/endpoints/server";
import { startEmit } from "../../shared/endpoints";
import { startEmitting } from "./emitter";

export const handleStart = implement(startEmit, ({ body }) =>
  startEmitting(body.key, body.rate, body.durationMs),
);

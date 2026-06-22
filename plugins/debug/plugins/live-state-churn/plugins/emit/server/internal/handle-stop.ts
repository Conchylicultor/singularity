import { implement } from "@plugins/infra/plugins/endpoints/server";
import { stopEmit } from "../../shared/endpoints";
import { stopEmitting } from "./emitter";

export const handleStop = implement(stopEmit, () => stopEmitting());

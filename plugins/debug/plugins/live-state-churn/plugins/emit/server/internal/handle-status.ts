import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getEmitStatus } from "../../shared/endpoints";
import { getStatus } from "./emitter";

export const handleStatus = implement(getEmitStatus, () => getStatus());

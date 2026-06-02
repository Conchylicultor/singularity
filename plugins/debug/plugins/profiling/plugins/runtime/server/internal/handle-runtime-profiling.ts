import {
  getRuntimeProfile as getProfileData,
  resetRuntimeProfile as doReset,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  getRuntimeProfile as getRuntimeProfileEndpoint,
  resetRuntimeProfile as resetRuntimeProfileEndpoint,
} from "../../shared/endpoints";

export const handleRuntimeProfiling = implement(
  getRuntimeProfileEndpoint,
  () => getProfileData(),
);

export const handleResetRuntimeProfiling = implement(
  resetRuntimeProfileEndpoint,
  () => {
    doReset();
  },
);

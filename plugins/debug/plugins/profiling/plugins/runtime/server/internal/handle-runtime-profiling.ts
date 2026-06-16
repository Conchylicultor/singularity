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
  () => {
    const profile = getProfileData();
    // sinceMs is the profiler's performance.now() at window start; the elapsed
    // window is now − sinceMs on the same monotonic clock. Computed here so the
    // client renders the true "since boot" duration instead of the raw offset.
    return { ...profile, windowMs: performance.now() - profile.sinceMs };
  },
);

export const handleResetRuntimeProfiling = implement(
  resetRuntimeProfileEndpoint,
  () => {
    doReset();
  },
);

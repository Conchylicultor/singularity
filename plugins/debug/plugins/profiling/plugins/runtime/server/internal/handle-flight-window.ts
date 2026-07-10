import { captureFlightWindow } from "@plugins/infra/plugins/runtime-profiler/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { FLIGHT_WINDOW_MS_DEFAULT, getFlightWindow } from "../../shared/endpoints";

export const handleFlightWindow = implement(getFlightWindow, ({ query }) => {
  // The schema defaults + clamps windowMs, but the query type is the schema's
  // INPUT side where the field is optional — mirror the default for tsc.
  const windowMs = query.windowMs ?? FLIGHT_WINDOW_MS_DEFAULT;
  // Both anchor halves are read back-to-back so they name the same instant on
  // the two clocks; every t0/t1 in the window converts through this pair (see
  // flightWindowResponseSchema).
  const atMs = performance.now();
  const wallTime = new Date().toISOString();
  return {
    wallAnchor: { atMs, wallTime },
    window: captureFlightWindow({
      windowStartMs: atMs - windowMs,
      maxOpen: 100,
      maxCompleted: 200,
    }),
  };
});

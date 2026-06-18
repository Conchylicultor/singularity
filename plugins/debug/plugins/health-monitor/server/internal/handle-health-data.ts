import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getHealthData } from "../../shared/endpoints";
import { readHealthSeries } from "./read-health-files";

const DEFAULT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h

export const handleHealthData = implement(getHealthData, ({ query }) => {
  const windowMs = query.windowMs ?? DEFAULT_WINDOW_MS;
  const { series, hostSamples } = readHealthSeries(windowMs);
  return { series, hostSamples, windowMs };
});

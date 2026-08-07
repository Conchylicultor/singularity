import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { readSignalOriginLines } from "@plugins/packages/plugins/signal-origin/plugins/sink/core";
import { getBuildRunTermination } from "../../core";
import { selectTermination } from "./select-termination";

/**
 * Most runs have nothing here, and that is a legitimate answer — an empty record
 * (`{signal: null, armFailure: null}`), never a 404. A run that simply was not
 * killed is not a missing resource, and making the caller distinguish a 404 from
 * a real one would put the ambiguity straight back.
 *
 * Synchronous read, like the profiling endpoint next door: the file is bounded
 * by its own sink and the read is positioned, so there is nothing to stream.
 */
export const handleBuildRunTermination = implement(getBuildRunTermination, ({ params }) => {
  const buildId = params.id;
  if (!buildId) throw new HttpError(400, "Missing id");
  return selectTermination(readSignalOriginLines(), buildId);
});

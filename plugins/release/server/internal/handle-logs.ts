import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { releaseLogsEndpoint } from "../../core/endpoints";
import { readReleaseTranscript } from "./transcript";

/**
 * The persisted log view of one run, served from its supervised-run transcript.
 *
 * It used to read `release-logs-<id>.json`, a parent-written, failure-only
 * artifact — so a successful finished run showed an empty pane, and a run whose
 * backend went away mid-flight (the case the file existed for) had nothing to
 * read at all. See `transcript.ts` for what replaced it and what the swap costs.
 */
export const handleReleaseLogs = implement(
  releaseLogsEndpoint,
  ({ params }) => {
    const releaseId = params.id;
    if (!releaseId) throw new HttpError(400, "Missing id");
    return { lines: readReleaseTranscript(releaseId) };
  },
);

import { z } from "zod";
import { settingsKey } from "@plugins/infra/plugins/audio-analysis/core";
import { ensureBeatFeatures } from "@plugins/infra/plugins/audio-analysis/server";
import { isNonRetryableError } from "@plugins/infra/plugins/jobs/server";
import { defineSupervisedJob } from "@plugins/infra/plugins/jobs/plugins/supervised-job/server";
import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import { parseUgTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { alignChords, WEAK_MATCH_THRESHOLD } from "../../core";
import { songUgAlignment } from "./tables";
import { readWork } from "./work";

// The alignment's transcript, at `logs/sonata-ug-alignment.jsonl` of the backend
// that supervises it (the child's own output, tailed).
const ugAlignmentLog = defineLogSink({
  id: "sonata-ug-alignment",
  description:
    "Sonata UG alignment: the recording's beat analysis (download, installs, extractor) and the sheet-to-beats alignment, with its transpose and score.",
});

const UgAlignInputSchema = z.object({ songId: z.string() });

/**
 * Align one UG song's sheet to its recording, in a detached child (`run` body):
 * beat analysis downloads audio and runs a minute of Python, which needs an
 * `ExecContext` and must not run on a backend's event loop.
 *
 * `lock` = the song, so two runs for one song never overlap; an enqueue that
 * loses the claim to a running alignment returns, and `onEnded` re-checks the
 * rows once that run has closed (its lock released), enqueueing again when the
 * sheet or the video moved while it ran.
 */
export const ugAlignJob = defineSupervisedJob({
  name: "sonata.ug-alignment.align",
  description:
    "Aligns an Ultimate Guitar song's chord sheet to the beats of its YouTube recording.",
  input: UgAlignInputSchema,
  channel: ugAlignmentLog,
  lock: (input) => input.songId,
  async run({ songId }, { log, exec }) {
    const work = await readWork(songId);
    if (work.kind === "idle") {
      log(`${songId}: nothing to do (${work.reason})`);
      return;
    }
    const { tab, videoId, hash } = work;
    log(`${songId}: aligning to ${videoId} (${work.reason})`);
    await songUgAlignment.upsert(songId, {
      status: "running",
      phase: "analysing",
      error: null,
      errorPermanent: false,
    });
    try {
      const features = await ensureBeatFeatures(videoId, exec, { log });
      // Every NOT NULL column, not `{ phase }` alone: an upsert is INSERT … ON
      // CONFLICT, and Postgres rejects the proposed row's missing NOT NULL
      // columns before the conflict turns it into an update.
      await songUgAlignment.upsert(songId, {
        status: "running",
        phase: "aligning",
        error: null,
        errorPermanent: false,
      });
      const started = Date.now();
      const record = alignChords(parseUgTab(tab), features, {
        capo: tab.capo,
        sheetHash: hash,
        settingsKey: settingsKey(features.source.settings),
      });
      const status = record.score >= WEAK_MATCH_THRESHOLD ? "aligned" : "weak";
      log(
        `${songId}: ${status} — score ${record.score.toFixed(3)}, transpose ${record.transpose}, ${record.segments.length} segments, ${Date.now() - started} ms`,
      );
      // A new video set while this ran supersedes this result: leave its
      // `queued` row for the run `onEnded` starts.
      const current = await songUgAlignment.get(songId);
      if (current?.videoId !== videoId) {
        log(`${songId}: the video changed while aligning — result dropped`);
        return;
      }
      await songUgAlignment.upsert(songId, {
        status,
        phase: null,
        record,
        error: null,
        errorPermanent: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await songUgAlignment.upsert(songId, {
        status: "failed",
        phase: null,
        error: message,
        // Only a video that will never be served is permanent: `decideWork`
        // never retries a permanent failure, not even after a sheet edit, so a
        // sheet that does not parse must stay retryable for its fix to align.
        errorPermanent: isNonRetryableError(err),
      });
      throw err;
    }
  },
  async onEnded(_runId, terminal, { input }): Promise<void> {
    const row = await songUgAlignment.get(input.songId);
    if (terminal.exitCode !== 0) {
      // A body that threw recorded `failed` itself; one killed mid-run left
      // `running`, which would read as aligning forever.
      if (row?.status === "running") {
        await songUgAlignment.upsert(input.songId, {
          status: "failed",
          phase: null,
          error: `The alignment was interrupted (exit ${terminal.exitCode}).`,
          errorPermanent: false,
        });
      }
      return;
    }
    const work = await readWork(input.songId);
    if (work.kind === "needed" && row?.status !== "failed") {
      await ugAlignJob.enqueue({ songId: input.songId });
    }
  },
});

import type { LiveRowResult } from "@plugins/network/plugins/live/web";
import type { UgTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import {
  ALIGNER_VERSION,
  fitsSheet,
  type AlignmentCandidate,
  type AlignmentPhase,
  type UgAlignmentRow,
} from "../../core";

/**
 * What the Recording section shows, derived from the live row and the open tab.
 * One arm per thing the user can be told; "not loaded yet" is its own arm, so a
 * pending read can never render as "no video".
 */
export type RecordingState =
  | { kind: "loading" }
  | { kind: "unreadable"; message: string }
  | { kind: "no-video" }
  /** The resolver is choosing: searching (`trying: null`), or aligning one candidate. */
  | {
      kind: "finding";
      trying: AlignmentCandidate | null;
      phase: AlignmentPhase | null;
      tried: number;
    }
  /**
   * The resolver tried candidates and none aligned well enough: the user is
   * asked. `best` is the best try's score — that record still plays
   * (unconfirmed); null when none scored.
   */
  | { kind: "needs-video"; tried: number; best: number | null }
  | { kind: "queued"; videoId: string }
  | { kind: "aligning"; videoId: string; phase: AlignmentPhase | null }
  | {
      kind: "aligned";
      videoId: string;
      score: number;
      /** Signed semitones, recording = sheet + transpose, in (−6, +6]. */
      transpose: number;
      capo: number;
      /** Made by an earlier aligner: still played, until the next re-align. */
      olderAligner: boolean;
    }
  /** Aligned below `WEAK_MATCH_THRESHOLD`: played all the same, as an unconfirmed match. */
  | { kind: "weak"; videoId: string; score: number; olderAligner: boolean }
  | {
      kind: "failed";
      videoId: string | null;
      message: string;
      permanent: boolean;
    }
  /**
   * The record cannot play this sheet — made for another sheet or video, or
   * its chords moved in today's parse — and nothing is re-aligning.
   */
  | { kind: "out-of-date"; videoId: string };

/** Candidates the resolver has tried (whatever came of them). */
export function triedCount(candidates: readonly AlignmentCandidate[]): number {
  return candidates.filter(
    (c) => c.outcome !== "untried" && c.outcome !== "trying",
  ).length;
}

/** The record's `[0, 12)` transpose as the nearer signed interval. */
export function signedTranspose(transpose: number): number {
  return transpose > 6 ? transpose - 12 : transpose;
}

export function recordingState(
  result: LiveRowResult<UgAlignmentRow>,
  tab: UgTab,
): RecordingState {
  if (result.status === "loading") return { kind: "loading" };
  if (result.status === "error") {
    return { kind: "unreadable", message: result.error.message };
  }
  if (!result.found) return { kind: "no-video" };
  const row = result.row;
  const videoId = row.videoId;
  if (row.status === "failed") {
    return {
      kind: "failed",
      videoId,
      message: row.error ?? "The alignment failed.",
      permanent: row.errorPermanent,
    };
  }
  if (videoId === null) {
    if (row.pick === "user") return { kind: "no-video" };
    const tried = triedCount(row.candidates);
    if (row.status === "needs-video") {
      const scores = row.candidates.flatMap((c) =>
        c.score === null ? [] : [c.score],
      );
      return {
        kind: "needs-video",
        tried,
        best: scores.length === 0 ? null : Math.max(...scores),
      };
    }
    return {
      kind: "finding",
      trying: row.candidates.find((c) => c.outcome === "trying") ?? null,
      phase: row.phase,
      tried,
    };
  }
  switch (row.status) {
    case "queued":
      return { kind: "queued", videoId };
    case "running":
    case "resolving":
      return { kind: "aligning", videoId, phase: row.phase };
    case "aligned":
    case "weak":
    case "needs-video": {
      const record = row.record;
      // The same rule as the player's (`appliedAlignment`): out of date
      // exactly when the record would not play.
      if (
        record === null ||
        record.videoId !== videoId ||
        !fitsSheet(record, tab.content)
      ) {
        return { kind: "out-of-date", videoId };
      }
      const olderAligner = record.alignerVersion !== ALIGNER_VERSION;
      return row.status === "aligned"
        ? {
            kind: "aligned",
            videoId,
            score: record.score,
            transpose: signedTranspose(record.transpose),
            capo: tab.capo,
            olderAligner,
          }
        : { kind: "weak", videoId, score: record.score, olderAligner };
    }
  }
}

const percent = (score: number) => `${Math.round(score * 100)}%`;

const olderAlignerNote = (older: boolean) =>
  older ? " · made by an earlier aligner (re-align to update)" : "";

/** "+2 (capo 2)", "−3", "0". */
export function formatTranspose(transpose: number, capo: number): string {
  const signed =
    transpose > 0 ? `+${transpose}` : transpose < 0 ? `−${-transpose}` : "0";
  return capo > 0 ? `${signed} (capo ${capo})` : signed;
}

/** The one-line status, for the collapsed summary and the body alike. */
export function recordingStateLine(state: RecordingState): string {
  switch (state.kind) {
    case "loading":
      return "Loading…";
    case "unreadable":
      return `Could not read the alignment: ${state.message}`;
    case "no-video":
      return "No recording";
    case "finding":
      return state.trying === null
        ? "Finding a video…"
        : `Trying ${state.trying.title ?? state.trying.videoId} (${state.phase === "aligning" ? "aligning" : "analysing"})…`;
    case "needs-video": {
      const tried = `${state.tried} tried`;
      return state.best === null
        ? `Needs a video (${tried})`
        : `Needs a video — playing the best try, a weak match (${percent(state.best)}, ${tried}); the timing is unconfirmed`;
    }
    case "queued":
      return "Waiting to align…";
    case "aligning":
      return state.phase === "aligning"
        ? "Aligning the sheet…"
        : "Analysing the recording…";
    case "aligned":
      return `Aligned ${percent(state.score)} · ${formatTranspose(state.transpose, state.capo)} semitones${olderAlignerNote(state.olderAligner)}`;
    case "weak":
      return `Weak match (${percent(state.score)}) — playing it, but the timing is unconfirmed; a better video may align${olderAlignerNote(state.olderAligner)}`;
    case "failed":
      return `Failed: ${state.message}`;
    case "out-of-date":
      return "Out of date — the alignment no longer fits this sheet; re-align to sync the video";
  }
}

/**
 * The state in a word or two, for the collapsed card's header (beside the
 * title, like the other sections' "Off" / "Auto-detect"). The full sentence is
 * {@link recordingStateLine}, in the body.
 */
export function recordingStateSummary(state: RecordingState): string {
  switch (state.kind) {
    case "loading":
      return "Loading…";
    case "unreadable":
      return "Unreadable";
    case "no-video":
      return "No recording";
    case "finding":
      return "Finding a video…";
    case "needs-video":
      return "Needs a video";
    case "queued":
    case "aligning":
      return "Aligning…";
    case "aligned":
      return percent(state.score);
    case "weak":
      return `Weak · ${percent(state.score)}`;
    case "failed":
      return "Failed";
    case "out-of-date":
      return "Out of date";
  }
}

import { describe, expect, it } from "bun:test";
import type { LiveRowResult } from "@plugins/network/plugins/live/web";
import type { UgTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { ALIGNER_VERSION, sheetHash, type UgAlignmentRow } from "../../core";
import type { AlignmentRecord } from "../../core/internal/record";
import {
  formatTranspose,
  recordingState,
  recordingStateLine,
  recordingStateSummary,
} from "./recording-state";

const tab: UgTab = {
  tabId: "1",
  songName: "Song",
  artistName: "Artist",
  type: "Chords",
  key: null,
  capo: 2,
  tuning: "E A D G B E",
  content: "[Verse]\n[ch]G[/ch]\nla",
  urlWeb: "https://tabs.ultimate-guitar.com/tab/1",
};

const VIDEO = "dQw4w9WgXcQ";

function record(over: Partial<AlignmentRecord> = {}): AlignmentRecord {
  return {
    alignerVersion: ALIGNER_VERSION,
    videoId: VIDEO,
    analysisVersion: 1,
    settingsKey: "final0-fastchroma",
    sheetHash: sheetHash(tab.content),
    durationSec: 4,
    beats: [0, 1, 2, 3].map((t) => ({ t, downbeat: t === 0 })),
    transpose: 2,
    segments: [{ kind: "gap", startBeat: 0, endBeat: 4 }],
    barConfidence: [1],
    score: 0.82,
    ...over,
  };
}

const refetch = () => Promise.resolve();

function found(over: Partial<UgAlignmentRow>): LiveRowResult<UgAlignmentRow> {
  return {
    status: "ready",
    found: true,
    refetch,
    row: {
      songId: "s1",
      videoId: VIDEO,
      status: "queued",
      phase: null,
      error: null,
      errorPermanent: false,
      record: null,
      updatedAt: new Date(0),
      ...over,
    } as UgAlignmentRow,
  };
}

describe("recordingState", () => {
  it("is loading while the row is not known, never 'no video'", () => {
    expect(recordingState({ status: "loading", refetch }, tab).kind).toBe(
      "loading",
    );
  });

  it("is no-video for a song without a row", () => {
    expect(
      recordingState({ status: "ready", found: false, refetch }, tab).kind,
    ).toBe("no-video");
  });

  it("shows the aligned score and the signed transpose with the capo", () => {
    const state = recordingState(
      found({ status: "aligned", record: record() }),
      tab,
    );
    expect(state).toEqual({
      kind: "aligned",
      videoId: VIDEO,
      score: 0.82,
      transpose: 2,
      capo: 2,
    });
    expect(recordingStateLine(state)).toBe(
      "Aligned 82% · +2 (capo 2) semitones",
    );
    // The collapsed header gets the short form; the sentence stays in the body.
    expect(recordingStateSummary(state)).toBe("82%");
  });

  it("reads a transpose above a tritone as the downward interval", () => {
    const state = recordingState(
      found({ status: "aligned", record: record({ transpose: 10 }) }),
      tab,
    );
    expect(state.kind === "aligned" && state.transpose).toBe(-2);
  });

  it("is out of date when the record was aligned to another sheet", () => {
    expect(
      recordingState(
        found({ status: "aligned", record: record({ sheetHash: "other" }) }),
        tab,
      ).kind,
    ).toBe("out-of-date");
  });

  it("is out of date when the record was made by another aligner version", () => {
    expect(
      recordingState(
        found({
          status: "aligned",
          record: record({ alignerVersion: ALIGNER_VERSION + 1 }),
        }),
        tab,
      ).kind,
    ).toBe("out-of-date");
  });

  it("is a weak match below the threshold", () => {
    const state = recordingState(
      found({ status: "weak", record: record({ score: 0.31 }) }),
      tab,
    );
    expect(recordingStateLine(state)).toBe("Needs a better video (31%)");
  });

  it("carries a failure's message and permanence", () => {
    expect(
      recordingState(
        found({ status: "failed", error: "gone", errorPermanent: true }),
        tab,
      ),
    ).toEqual({
      kind: "failed",
      videoId: VIDEO,
      message: "gone",
      permanent: true,
    });
  });

  it("shows the running phase", () => {
    const state = recordingState(
      found({ status: "running", phase: "aligning" }),
      tab,
    );
    expect(recordingStateLine(state)).toBe("Aligning the sheet…");
  });
});

describe("formatTranspose", () => {
  it("signs the interval and names the capo", () => {
    expect(formatTranspose(0, 0)).toBe("0");
    expect(formatTranspose(-3, 0)).toBe("−3");
    expect(formatTranspose(2, 2)).toBe("+2 (capo 2)");
  });
});

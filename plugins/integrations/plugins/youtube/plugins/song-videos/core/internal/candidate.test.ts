import { describe, expect, test } from "bun:test";
import { mergeSourceAnswers, type SourceVideo } from "./candidate";

const video = (
  videoId: string,
  over: Partial<SourceVideo> = {},
): SourceVideo => ({
  videoId,
  title: null,
  channel: null,
  durationSec: null,
  evidence: "search",
  ...over,
});

describe("mergeSourceAnswers", () => {
  test("one candidate per video, in first-seen order, with each source's position", () => {
    const merged = mergeSourceAnswers([
      {
        source: "hooktheory",
        answer: {
          kind: "answered",
          videos: [
            video("BBBBBBBBBBB", {
              evidence: "human-synced",
              durationSec: 250,
            }),
          ],
        },
      },
      {
        source: "youtube-search",
        answer: {
          kind: "answered",
          videos: [
            video("AAAAAAAAAAA", { title: "Song", channel: "Artist" }),
            video("BBBBBBBBBBB", {
              title: "Song (Official Video)",
              channel: "Artist",
              durationSec: 251,
            }),
          ],
        },
      },
    ]);
    expect(merged.map((c) => c.videoId)).toEqual([
      "BBBBBBBBBBB",
      "AAAAAAAAAAA",
    ]);
    expect(merged[0]).toEqual({
      videoId: "BBBBBBBBBBB",
      // Each field from the first source that knew it.
      title: "Song (Official Video)",
      channel: "Artist",
      durationSec: 250,
      viewCount: null,
      channelVerified: false,
      artTrack: false,
      sources: [
        { source: "hooktheory", evidence: "human-synced", rank: 0 },
        { source: "youtube-search", evidence: "search", rank: 1 },
      ],
    });
  });

  test("an unavailable source contributes nothing", () => {
    expect(
      mergeSourceAnswers([
        {
          source: "hooktheory",
          answer: { kind: "unavailable", reason: "not loaded" },
        },
        { source: "youtube-search", answer: { kind: "answered", videos: [] } },
      ]),
    ).toEqual([]);
  });

  test("a video one source lists twice keeps its first position", () => {
    const [only] = mergeSourceAnswers([
      {
        source: "youtube-search",
        answer: {
          kind: "answered",
          videos: [video("AAAAAAAAAAA"), video("AAAAAAAAAAA")],
        },
      },
    ]);
    expect(only?.sources).toEqual([
      { source: "youtube-search", evidence: "search", rank: 0 },
    ]);
  });

  test("flags are true when any source says so", () => {
    const [only] = mergeSourceAnswers([
      {
        source: "a",
        answer: { kind: "answered", videos: [video("AAAAAAAAAAA")] },
      },
      {
        source: "b",
        answer: {
          kind: "answered",
          videos: [
            video("AAAAAAAAAAA", {
              artTrack: true,
              channelVerified: true,
              viewCount: 5,
            }),
          ],
        },
      },
    ]);
    expect(only).toMatchObject({
      artTrack: true,
      channelVerified: true,
      viewCount: 5,
    });
  });
});

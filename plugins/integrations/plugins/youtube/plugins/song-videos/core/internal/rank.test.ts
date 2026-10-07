import { describe, expect, test } from "bun:test";
import type { SongQuery, VideoCandidate } from "./candidate";
import { rankCandidates } from "./rank";

let nextId = 0;
function candidate(over: Partial<VideoCandidate>): VideoCandidate {
  nextId += 1;
  return {
    videoId: `vid${String(nextId).padStart(8, "0")}`,
    title: null,
    channel: null,
    durationSec: null,
    viewCount: null,
    channelVerified: false,
    artTrack: false,
    sources: [{ source: "youtube-search", evidence: "search", rank: 0 }],
    ...over,
  };
}

const order = (query: SongQuery, cs: VideoCandidate[]) =>
  rankCandidates(query, cs).map((c) => c.videoId);

const wonderwall: SongQuery = { artist: "Oasis", title: "Wonderwall" };

describe("rankCandidates on a real results page", () => {
  // yt-dlp's flat search for "Oasis Wonderwall" (2026-10-07), in YouTube's order.
  const page: VideoCandidate[] = [
    [
      "6hzrDeceEKc",
      "Oasis - Wonderwall (Official Video)",
      "Oasis",
      280,
      705_720_370,
      true,
      false,
    ],
    [
      "FVdjZYfDuLE",
      "Wonderwall (Remastered)",
      "Oasis",
      259,
      11_987_464,
      true,
      true,
    ],
    [
      "8LaTzWMbShY",
      "Oasis - Wonderwall (Lyrics)",
      "Young Pilgrim Music",
      259,
      9_575_406,
      false,
      false,
    ],
    [
      "bx1Bh8ZvH84",
      "Oasis - Wonderwall (Official Video)",
      "Oasis",
      278,
      1_000_000,
      true,
      false,
    ],
    [
      "Ve1EbKsNCdw",
      "Oasis - Wonderwall (Live at Knebworth, 10 August ‘96)",
      "Oasis",
      247,
      2_000_000,
      true,
      false,
    ],
    [
      "jBZUq-_e7SM",
      "Oasis - Wonderwall (Best Ever Live Version) HQ",
      "OkayThen",
      288,
      3_000_000,
      false,
      false,
    ],
    [
      "ajHr7fEmfms",
      "Oasis 'Wonderwall' Live in Dublin 16th August 2025 PRO ish SHOT in 4K",
      "WE ARE ROBOT",
      257,
      100_000,
      false,
      false,
    ],
    [
      "r7BJP5M7gNg",
      "Wonderwall - Oasis (Lyrics)",
      "Velvety Ranger",
      259,
      1_000_000,
      false,
      false,
    ],
    [
      "R_EXyGWI9rU",
      "Oasis - Wonderwall (Karaoke Version)",
      "Sing King",
      291,
      1_000_000,
      false,
      false,
    ],
    [
      "kVFrc5JVm0k",
      "Liam Gallagher Wonderwall Live Knebworth 22'",
      "Definitely Aquiesces ",
      255,
      50_000,
      false,
      false,
    ],
  ].map(
    (
      [
        videoId,
        title,
        channel,
        durationSec,
        viewCount,
        channelVerified,
        artTrack,
      ],
      rank,
    ) => ({
      videoId: videoId as string,
      title: title as string,
      channel: channel as string,
      durationSec: durationSec as number,
      viewCount: viewCount as number,
      channelVerified: channelVerified as boolean,
      artTrack: artTrack as boolean,
      sources: [
        { source: "youtube-search", evidence: "search" as const, rank },
      ],
    }),
  );

  const ranked = rankCandidates(wonderwall, page);
  const position = (id: string) => ranked.findIndex((c) => c.videoId === id);

  test("the art track (the studio audio) comes first, the official videos next", () => {
    expect(ranked.slice(0, 3).map((c) => c.videoId)).toEqual([
      "FVdjZYfDuLE",
      "6hzrDeceEKc",
      "bx1Bh8ZvH84",
    ]);
  });

  test("lyric uploads of the studio audio beat every other version", () => {
    for (const other of [
      "Ve1EbKsNCdw",
      "jBZUq-_e7SM",
      "R_EXyGWI9rU",
      "kVFrc5JVm0k",
      "ajHr7fEmfms",
    ]) {
      expect(position("8LaTzWMbShY")).toBeLessThan(position(other));
    }
  });

  test("live and karaoke versions come last, and say why", () => {
    const tail = new Set(ranked.slice(-5).map((c) => c.videoId));
    expect(tail).toEqual(
      new Set([
        "Ve1EbKsNCdw",
        "jBZUq-_e7SM",
        "ajHr7fEmfms",
        "R_EXyGWI9rU",
        "kVFrc5JVm0k",
      ]),
    );
    expect(ranked.find((c) => c.videoId === "R_EXyGWI9rU")?.reasons).toContain(
      "karaoke",
    );
    expect(ranked.find((c) => c.videoId === "Ve1EbKsNCdw")?.reasons).toContain(
      "live",
    );
  });
});

describe("the kind of upload", () => {
  test("art track > official audio > official video > other uploads", () => {
    const other = candidate({ title: "Oasis - Wonderwall", channel: "fan" });
    const video = candidate({
      title: "Oasis - Wonderwall (Official Music Video)",
      channel: "fan",
    });
    const audio = candidate({
      title: "Oasis - Wonderwall (Official Audio)",
      channel: "fan",
    });
    const topic = candidate({ title: "Wonderwall", channel: "Oasis - Topic" });
    expect(order(wonderwall, [other, video, audio, topic])).toEqual([
      topic.videoId,
      audio.videoId,
      video.videoId,
      other.videoId,
    ]);
  });

  test("a '- Topic' channel counts as an art track even without the flag, and names the artist", () => {
    const [ranked] = rankCandidates(wonderwall, [
      candidate({ title: "Wonderwall", channel: "Oasis - Topic" }),
    ]);
    expect(ranked?.reasons).toEqual(
      expect.arrayContaining(["art track", "title 1.00", "artist 1.00"]),
    );
  });

  test("the artist's own channel (verified or VEVO) beats a fan upload of the same title", () => {
    const fan = candidate({
      title: "Rick Astley - Never Gonna Give You Up",
      channel: "fan",
    });
    const vevo = candidate({
      title: "Rick Astley - Never Gonna Give You Up",
      channel: "RickAstleyVEVO",
    });
    expect(
      order({ artist: "Rick Astley", title: "Never Gonna Give You Up" }, [
        fan,
        vevo,
      ]),
    ).toEqual([vevo.videoId, fan.videoId]);
  });
});

describe("version terms", () => {
  test.each([
    "Live",
    "Cover",
    "Remix",
    "Sped Up",
    "Slowed",
    "Karaoke",
    "Acoustic",
    "Unplugged",
    "Demo",
    "Instrumental",
    "8D",
    "Reaction",
    "Tutorial",
    "Lesson",
  ])("%s costs", (term) => {
    const plain = candidate({ title: "Oasis - Wonderwall", channel: "x" });
    const version = candidate({
      title: `Oasis - Wonderwall ${term}`,
      channel: "x",
    });
    expect(order(wonderwall, [version, plain])).toEqual([
      plain.videoId,
      version.videoId,
    ]);
  });

  test("a term the song's own name has is free", () => {
    const query = { artist: "Eric Clapton", title: "Layla (Acoustic)" };
    const [ranked] = rankCandidates(query, [
      candidate({ title: "Eric Clapton - Layla (Acoustic)", channel: "x" }),
    ]);
    expect(ranked?.reasons).not.toContain("acoustic");
  });

  test("a term only matches as a word ('lively' is not 'live', 'discover' not 'cover')", () => {
    const [ranked] = rankCandidates({ artist: "A", title: "Lively Discover" }, [
      candidate({ title: "A - Lively Discover", channel: "x" }),
    ]);
    expect(ranked?.reasons).not.toContain("live");
    expect(ranked?.reasons).not.toContain("cover");
  });
});

describe("match", () => {
  test("a video of another song by the artist ranks below the song", () => {
    const other = candidate({
      title: "Oasis - Champagne Supernova",
      channel: "Oasis",
    });
    const song = candidate({ title: "Oasis - Wonderwall", channel: "fan" });
    expect(order(wonderwall, [other, song])).toEqual([
      song.videoId,
      other.videoId,
    ]);
  });

  test("words beyond the song and the artist cost", () => {
    const query = { artist: "The Beatles", title: "Let It Be" };
    const longer = candidate({
      title: "Let It Be Me - The Beatles",
      channel: "x",
    });
    const exact = candidate({ title: "The Beatles - Let It Be", channel: "x" });
    expect(order(query, [longer, exact])).toEqual([
      exact.videoId,
      longer.videoId,
    ]);
  });

  test("spelling differences do not matter", () => {
    const [ranked] = rankCandidates({ artist: "Beyoncé", title: "Halo" }, [
      candidate({ title: "BEYONCE - HALO", channel: "x" }),
    ]);
    expect(ranked?.reasons).toEqual(
      expect.arrayContaining(["title 1.00", "artist 1.00"]),
    );
  });
});

describe("duration", () => {
  test("more than 25 % off the median costs; within it does not", () => {
    const query = { artist: "A", title: "Song" };
    const cs = [200, 210, 205, 300].map((d) =>
      candidate({ title: "A - Song", channel: "x", durationSec: d }),
    );
    const ranked = rankCandidates(query, cs);
    expect(ranked.at(-1)?.durationSec).toBe(300);
    expect(ranked.at(-1)?.reasons).toContain("duration outlier");
    expect(ranked[0]?.reasons).not.toContain("duration outlier");
  });

  test("fewer than three durations judge nothing", () => {
    const ranked = rankCandidates({ artist: "A", title: "Song" }, [
      candidate({ title: "A - Song", channel: "x", durationSec: 100 }),
      candidate({ title: "A - Song", channel: "x", durationSec: 400 }),
    ]);
    for (const c of ranked) expect(c.reasons).not.toContain("duration outlier");
  });
});

describe("evidence", () => {
  test("a human-synced video beats an official video", () => {
    const official = candidate({
      title: "Oasis - Wonderwall (Official Video)",
      channel: "Oasis",
      channelVerified: true,
    });
    const synced = candidate({
      title: "Oasis - Wonderwall",
      channel: "someone",
      sources: [{ source: "hooktheory", evidence: "human-synced", rank: 0 }],
    });
    expect(order(wonderwall, [official, synced])).toEqual([
      synced.videoId,
      official.videoId,
    ]);
  });

  test("an untitled human-synced video still ranks above a fan upload", () => {
    const synced = candidate({
      sources: [{ source: "hooktheory", evidence: "human-synced", rank: 0 }],
    });
    const fan = candidate({ title: "wonderwall guitar", channel: "x" });
    expect(order(wonderwall, [fan, synced])).toEqual([
      synced.videoId,
      fan.videoId,
    ]);
  });

  test("ties keep the sources' order", () => {
    const a = candidate({ title: "Oasis - Wonderwall", channel: "x" });
    const b = candidate({ title: "Oasis - Wonderwall", channel: "x" });
    expect(order(wonderwall, [a, b])).toEqual([a.videoId, b.videoId]);
  });

  test("a later position in the source costs a little", () => {
    const first = candidate({ title: "Oasis - Wonderwall", channel: "x" });
    const later = candidate({
      title: "Oasis - Wonderwall",
      channel: "x",
      sources: [{ source: "youtube-search", evidence: "search", rank: 5 }],
    });
    expect(order(wonderwall, [later, first])).toEqual([
      first.videoId,
      later.videoId,
    ]);
  });
});

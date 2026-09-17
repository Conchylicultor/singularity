import { describe, expect, it } from "bun:test";
import { INDEX_DERIVATION_VERSION, deriveSection } from "./derive";
import { chord, progression, rest, section } from "./test-sections";

describe("deriveSection", () => {
  it("reads every chord into a token and its spelling features, rests kept", () => {
    const derived = deriveSection(
      section([
        chord(1, 4, { root: 1 }),
        rest(5, 4),
        chord(9, 4, { root: 5, applied: 5 }), // V/V: D major in C
        chord(13, 4, { root: 6, borrowed: "minor" }), // ♭VI
      ]),
    );
    if (derived.kind !== "indexed")
      throw new Error(`skipped: ${derived.reason}`);
    expect<unknown>(
      derived.chords.map((c) =>
        c.reading.kind === "sound"
          ? [c.reading.token, c.reading.features]
          : "rest",
      ),
    ).toEqual([
      ["0:4-3/0", []],
      "rest",
      ["2:4-3/0", ["applied"]],
      ["8:4-3/0", ["borrowed"]],
    ]);
    expect(derived.chords[2]?.key).toEqual({
      beat: 1,
      tonic: "C",
      scale: "major",
    });
  });

  it("reads tokens relative to the key in force at each chord", () => {
    const derived = deriveSection(
      section(progression([1, 1], 4), {
        keys: [
          { beat: 1, tonic: "C", scale: "major" },
          { beat: 5, tonic: "A", scale: "minor" },
        ],
      }),
    );
    if (derived.kind !== "indexed")
      throw new Error(`skipped: ${derived.reason}`);
    expect<unknown>(
      derived.chords.map((c) => c.reading.kind === "sound" && c.reading.token),
    ).toEqual(["0:4-3/0", "0:3-4/0"]);
  });

  it("skips a section with an unreadable chord, naming the rule", () => {
    const derived = deriveSection(
      section([
        ...progression([1, 4], 4),
        chord(9, 4, { alterations: ["b9"] }),
      ]),
    );
    expect(derived).toMatchObject({
      kind: "skipped",
      reason: "unreadable:type,alterations",
    });
  });

  it("skips a section whose unreadable chord is a rest, as the reference does", () => {
    const derived = deriveSection(
      section([...progression([1, 4], 4), { ...rest(9, 4), alternate: "_" }]),
    );
    expect(derived).toMatchObject({
      kind: "skipped",
      reason: "unreadable:alternate",
    });
  });

  it("skips a section where nothing sounds", () => {
    expect(deriveSection(section([]))).toMatchObject({
      kind: "skipped",
      reason: "no-chords",
    });
    expect(deriveSection(section([rest(1, 8)]))).toMatchObject({
      kind: "skipped",
      reason: "no-chords",
    });
  });

  it("skips a section where a sounding chord ends after endBeat", () => {
    const chords = progression([1, 4, 5], 4);
    expect(deriveSection(section(chords, { endBeat: 12 }))).toMatchObject({
      kind: "skipped",
      reason: "chord-past-end",
    });
    // A rest past the end is not a sounding chord; drift within 1e-6 is tolerated.
    expect(
      deriveSection(section([...chords, rest(13, 8)], { endBeat: 13 })).kind,
    ).toBe("indexed");
    expect(deriveSection(section(chords, { endBeat: 13 - 1e-7 })).kind).toBe(
      "indexed",
    );
  });

  it("skips a section with a chord before every key", () => {
    expect(
      deriveSection(
        section(progression([1, 4], 4), {
          keys: [{ beat: 5, tonic: "C", scale: "major" }],
        }),
      ),
    ).toMatchObject({ kind: "skipped", reason: "chord-before-first-key" });
  });

  it("keeps a section with no video or no timing, without loops", () => {
    const chords = progression([1, 4, 5, 1], 4);
    expect(deriveSection(section(chords, { videoId: null }))).toMatchObject({
      kind: "indexed",
      loops: { kind: "unloopable", reason: "no-video" },
    });
    expect(
      deriveSection(section(chords, { alignment: { kind: "none" } })),
    ).toMatchObject({
      kind: "indexed",
      loops: { kind: "unloopable", reason: "no-timing" },
    });
    // A video-fraction alignment is timing enough: the player resolves it.
    expect(
      deriveSection(
        section(chords, {
          alignment: {
            kind: "video-fraction",
            start: 0.1,
            end: 0.3,
            endBeat: 17,
          },
        }),
      ),
    ).toMatchObject({ kind: "indexed", loops: { kind: "windows" } });
  });

  it("has a derivation version", () => {
    expect(Number.isInteger(INDEX_DERIVATION_VERSION)).toBe(true);
  });
});

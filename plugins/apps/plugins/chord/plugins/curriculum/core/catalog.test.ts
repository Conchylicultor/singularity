import { describe, expect, test } from "bun:test";
import {
  chordTokenFromParts,
  parseChordToken,
  type ChordToken,
  type TokenSetCount,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import {
  buildCatalog,
  catalogOrder,
  chordPlaces,
  groupState,
  isListed,
  listedTokens,
  sectionTokens,
  suggestedNext,
  trackStanding,
  trackTokens,
  type Catalog,
  type CatalogTrack,
} from "./catalog";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  MAJOR_NAMES,
  MODE_SCALES,
  SECTION_NAMES,
  TRACK_RULES,
} from "./catalog-rules";
import { firstSelection, type Selection } from "./selection";

const t = (text: string) => text as ChordToken;
const I = t("0:4-3/0");
const IV = t("5:4-3/0");
const V = t("7:4-3/0");
const vi = t("9:3-4/0");
const viiDim = t("11:3-3/0");
const V7 = t("7:4-3-3/0");
const Vsus4 = t("7:5-2/0");
const Isus4 = t("0:5-2/0");
const Isus2 = t("0:2-5/0");
const IVsus2 = t("5:2-5/0");
const II = t("2:4-3/0");
const III = t("4:4-3/0");
const odd = t("0:1-1/0");
const i = t("0:3-4/0");
const iv = t("5:3-4/0");

const set = (
  mode: HookpadMode,
  tokens: ChordToken[],
  windows: number,
): TokenSetCount => ({ mode, tokens, windows });

/** 1,000 major windows, and 100 minor ones. */
const SETS: TokenSetCount[] = [
  set("major", [I, IV, V], 500),
  set("major", [I, vi], 300),
  set("major", [I, viiDim], 5),
  set("major", [V7, I], 100),
  set("major", [I], 6),
  set("major", [Vsus4], 50),
  set("major", [Isus4], 5),
  set("major", [Isus2], 4),
  set("major", [IVsus2], 3),
  set("major", [II], 4),
  set("major", [III], 3),
  set("major", [odd], 20),
  set("minor", [i, iv], 100),
];

const trackOf = (catalog: Catalog, id: string): CatalogTrack => {
  const track = catalog.tracks.find((tr) => tr.id === id);
  if (track === undefined) throw new Error(`no track ${id}`);
  return track;
};
const sectionOf = (track: CatalogTrack, id: string) => {
  const section = track.sections.find((s) => s.id === `${track.id}:${id}`);
  if (section === undefined) throw new Error(`no section ${id} in ${track.id}`);
  return section;
};

describe("buildCatalog over a known index", () => {
  const catalog = buildCatalog(SETS);
  const major = trackOf(catalog, "major");

  test("a track counts the windows of its modes only", () => {
    expect(major.windows).toBe(1000);
    expect(trackOf(catalog, "minor").windows).toBe(100);
  });

  test("Core first and complete, however rare a chord of it is; chords by share", () => {
    const core = major.sections[0];
    expect(core?.id).toBe("major:core");
    expect(core?.chords).toEqual([
      { token: I, share: 0.911, reading: null },
      { token: IV, share: 0.5, reading: null },
      { token: V, share: 0.5, reading: null },
      { token: vi, share: 0.3, reading: null },
      { token: viiDim, share: 0.005, reading: null },
    ]);
    expect(core?.rare).toBeNull();
    expect(core?.coverage).toBe(0.911);
  });

  test("sections between Core and Other are ordered by coverage", () => {
    expect(major.sections.map((s) => s.id)).toEqual([
      "major:core",
      "major:sevenths",
      "major:colour",
      "major:secondary",
      "major:other",
    ]);
    expect(sectionOf(major, "sevenths").coverage).toBe(0.1);
    expect(sectionOf(major, "colour").coverage).toBeCloseTo(0.062, 10);
  });

  test("more than two chords below 1 % fold into the rare group", () => {
    const colour = sectionOf(major, "colour");
    expect(colour.chords).toEqual([
      { token: Vsus4, share: 0.05, reading: null },
    ]);
    expect(colour.rare?.tokens).toEqual([Isus4, Isus2, IVsus2]);
    expect(colour.rare?.share).toBeCloseTo(0.012, 10);
  });

  test("two chords or fewer below 1 % are listed instead", () => {
    const secondary = sectionOf(major, "secondary");
    expect(secondary.chords.map((c) => c.token)).toEqual([II, III]);
    expect(secondary.rare).toBeNull();
  });

  test("Other lists nothing, however common its chords", () => {
    const other = sectionOf(major, "other");
    expect(other.kind).toBe("other");
    expect(other.chords).toEqual([]);
    expect(other.rare).toEqual({ tokens: [odd], share: 0.02 });
  });

  test("Sevenths & jazz holds only chords of four tones or more", () => {
    const jazz = trackOf(catalog, "jazz");
    expect(trackTokens(jazz)).toEqual([V7]);
    expect(sectionOf(jazz, "sevenths").chords).toEqual([
      { token: V7, share: 0.1, reading: null },
    ]);
  });

  test("isListed: any track lists it; a rare-group or Other chord is not listed", () => {
    for (const token of [I, viiDim, V7, Vsus4, II, i, iv])
      expect(isListed(catalog, token)).toBe(true);
    for (const token of [Isus2, IVsus2, odd])
      expect(isListed(catalog, token)).toBe(false);
    expect(listedTokens(catalog).has(Isus4)).toBe(false);
  });

  test("catalogOrder: tracks, sections, share — each listed chord once", () => {
    const order = catalogOrder(catalog);
    expect(order.slice(0, 7)).toEqual([I, IV, V, vi, viiDim, V7, Vsus4]);
    expect(new Set(order).size).toBe(order.length);
    expect(order).not.toContain(odd);
  });

  test("suggestedNext: the most common listed chord still off, only in a started track", () => {
    expect(suggestedNext(major, firstSelection())).toBe(vi);
    expect(suggestedNext(trackOf(catalog, "minor"), firstSelection())).toBe(
      null,
    );
  });

  test("trackStanding and groupState read the selection against the catalog", () => {
    const selection: Selection = {
      chords: [
        { token: I, state: "practice" },
        { token: vi, state: "hear" },
        { token: Isus2, state: "hear" },
      ],
      blanks: "all",
      extras: 0,
    };
    expect(trackStanding(major, selection)).toEqual({
      started: true,
      practised: 1,
      heard: 1,
      rare: 1,
    });
    expect(trackStanding(trackOf(catalog, "jazz"), selection).started).toBe(
      false,
    );
    const colourRare = sectionOf(major, "colour").rare?.tokens ?? [];
    expect(groupState(selection, colourRare)).toBe("mixed");
    expect(groupState(selection, [I])).toBe("practice");
    expect(() => groupState(selection, [])).toThrow(/empty group/);
  });

  test("chordPlaces names every track and section holding a chord", () => {
    expect(chordPlaces(catalog, V7)).toEqual([
      {
        trackId: "major",
        sectionId: "major:sevenths",
        listed: true,
        share: 0.1,
      },
      { trackId: "jazz", sectionId: "jazz:sevenths", listed: true, share: 0.1 },
    ]);
    expect(chordPlaces(catalog, odd)).toEqual([
      {
        trackId: "major",
        sectionId: "major:other",
        listed: false,
        groupShare: 0.02,
      },
    ]);
  });
});

describe("buildCatalog: modal sections", () => {
  const catalog = buildCatalog([
    set("dorian", [i, IV], 30),
    set("dorian", [i], 10),
    set("lydian", [I, II], 20),
    set("lydian", [i], 20),
  ]);
  const modal = trackOf(catalog, "modal");

  test("each mode is its own section, counted in its own windows, the larger first", () => {
    expect(modal.sections.map((s) => [s.id, s.windows])).toEqual([
      ["modal:dorian", 40],
      ["modal:lydian", 40],
    ]);
    expect(sectionOf(modal, "dorian").chords).toEqual([
      { token: i, share: 1, reading: null },
      { token: IV, share: 0.75, reading: null },
    ]);
  });

  test("a chord heard in two modes is in both sections", () => {
    expect(sectionTokens(sectionOf(modal, "lydian"))).toContain(i);
    expect(sectionTokens(sectionOf(modal, "dorian"))).toContain(i);
  });

  test("a mode lists a chord from 5 %, its windows being few", () => {
    const dorian = sectionOf(
      trackOf(
        buildCatalog([
          set("dorian", [i], 100),
          set("dorian", [IV], 4),
          set("dorian", [t("2:3-4/0")], 3),
          set("dorian", [V], 2),
        ]),
        "modal",
      ),
      "dorian",
    );
    expect(dorian.chords.map((c) => c.token)).toEqual([i]);
    expect(dorian.rare?.tokens).toEqual([IV, t("2:3-4/0"), V]);
  });

  test("no index at all: every track is there, with no section", () => {
    expect(buildCatalog([]).tracks.map((tr) => [tr.id, tr.sections])).toEqual(
      TRACK_RULES.map((rule) => [rule.id, []]),
    );
  });
});

describe("buildCatalog places every chord exactly once per mode", () => {
  // Every root × a spread of stacks × every inversion, scattered over every
  // mode by a fixed pseudo-random draw: what no hand list foresees.
  const STACKS = [
    [4, 3],
    [3, 4],
    [3, 3],
    [4, 4],
    [5, 2],
    [2, 5],
    [4, 3, 3],
    [4, 3, 4],
    [3, 4, 3],
    [3, 3, 4],
    [3, 3, 3],
    [3, 4, 4],
    [4, 3, 7],
    [3, 4, 7],
    [5, 2, 3],
    [4, 3, 2],
    [4, 3, 3, 4],
    [4, 3, 3, 4, 3],
    [7],
    [],
    [1, 1],
  ];
  const tokens: ChordToken[] = [];
  for (let root = 0; root < 12; root++) {
    for (const intervals of STACKS) {
      for (let inversion = 0; inversion <= intervals.length; inversion++) {
        tokens.push(chordTokenFromParts({ root, intervals, inversion }));
      }
    }
  }
  const modes = Object.keys(MODE_SCALES) as HookpadMode[];
  let seed = 42;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const sets: TokenSetCount[] = [];
  for (let n = 0; n < 4000; n++) {
    const mode = modes[Math.floor(random() * modes.length)] ?? "major";
    const size = 1 + Math.floor(random() * 4);
    const chosen = Array.from(
      { length: size },
      () => tokens[Math.floor(random() * tokens.length)] ?? I,
    );
    sets.push(set(mode, chosen, 1 + Math.floor(random() * 50)));
  }
  const catalog = buildCatalog(sets);

  for (const rule of TRACK_RULES) {
    test(`${rule.name}: each chord of each of its modes is in exactly one section of that mode`, () => {
      const track = trackOf(catalog, rule.id);
      for (const mode of rule.scope) {
        const occurring = new Set(
          sets.filter((s) => s.mode === mode).flatMap((s) => s.tokens),
        );
        const sections = track.sections.filter((s) => s.scope.includes(mode));
        const placed = sections.flatMap(sectionTokens);
        // No chord twice among the sections counting this mode.
        expect(placed.length).toBe(new Set(placed).size);
        for (const token of occurring) {
          const admitted =
            rule.admits === undefined || rule.admits(parseChordToken(token));
          expect(placed.filter((p) => p === token).length).toBe(
            admitted ? 1 : 0,
          );
        }
        // And nothing that does not occur in the mode.
        for (const token of placed) expect(occurring.has(token)).toBe(true);
      }
    });
  }

  test("shares and coverages are fractions of the section's windows", () => {
    for (const track of catalog.tracks) {
      for (const section of track.sections) {
        expect(section.coverage).toBeGreaterThan(0);
        expect(section.coverage).toBeLessThanOrEqual(1);
        for (const chord of section.chords) {
          expect(chord.share).toBeLessThanOrEqual(section.coverage + 1e-12);
        }
        const shares = section.chords.map((c) => c.share);
        expect(shares).toEqual([...shares].sort((a, b) => b - a));
      }
    }
  });
});

describe("buildCatalog: readings", () => {
  const I6 = t("0:4-3/1");
  const I7 = t("0:4-3-3/0");
  const flatII = t("1:4-3/0");
  const catalog = buildCatalog([
    set("major", [I, II, I6, I7, flatII], 100),
    set("minor", [i, I, IV, flatII], 100),
    set("phrygian", [i, flatII], 100),
  ]);
  const readingOf = (track: string, section: string, token: ChordToken) =>
    sectionOf(trackOf(catalog, track), section).chords.find(
      (c) => c.token === token,
    )?.reading;

  test("structural readings: an inversion over its bass, an applied dominant by its target", () => {
    expect(readingOf("major", "inversions", I6)).toBe("I/3");
    expect(readingOf("major", "secondary", II)).toBe("V/V");
    expect(readingOf("major", "secondary", I7)).toBe("V7/IV");
    expect(readingOf("major", "core", I)).toBeNull();
  });

  test("a name depends on where the chord is heard", () => {
    expect(readingOf("major", "borrowed", flatII)).toBe("Neapolitan");
    expect(readingOf("minor", "colour", flatII)).toBe("Neapolitan");
    expect(readingOf("minor", "borrowed", I)).toBe("Picardy");
    expect(readingOf("minor", "borrowed", IV)).toBe("dorian IV");
    expect(readingOf("modal", "phrygian", flatII)).toBe("phrygian");
    expect(readingOf("modal", "phrygian", i)).toBeNull();
  });

  test("every named chord is spelled as some chord's label", () => {
    // Every label the common stacks take, on any root.
    const labels = new Set<string>();
    const stacks = [
      [4, 3],
      [3, 4],
      [3, 3],
      [4, 3, 3],
      [4, 3, 4],
      [3, 4, 3],
      [3, 3, 3],
      [4, 3, 3, 4, 3],
    ];
    for (let root = 0; root < 12; root++) {
      for (const intervals of stacks) {
        labels.add(
          chordLabel(chordTokenFromParts({ root, intervals, inversion: 0 }))
            .text,
        );
      }
    }
    const names = [
      ...Object.keys(MAJOR_NAMES),
      ...Object.values(SECTION_NAMES).flatMap((sections) =>
        Object.values(sections).flatMap((n) => Object.keys(n)),
      ),
    ];
    expect(names.filter((name) => !labels.has(name))).toEqual([]);
  });
});

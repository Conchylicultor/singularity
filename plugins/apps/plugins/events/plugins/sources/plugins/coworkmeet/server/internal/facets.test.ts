import { describe, expect, it } from "bun:test";
import {
  COWORKMEET_AMBIANCES,
  COWORKMEET_DISTRICTS,
  COWORKMEET_POWER_OUTLETS,
  COWORKMEET_QUIET_LEVELS,
  COWORKMEET_SESSION_TYPES,
  coworkmeetSourceConfigFields,
  facetLabels,
  type CoworkmeetFilterKey,
} from "../../core";
import { facetTags, sessionFacets } from "./facets";
import { AFTERWORK, BARE, HOXTON, NELSONS, OISE, PANTIN } from "./fixtures";

describe("sessionFacets", () => {
  it("reads a fully-rated session in the association's own words", () => {
    expect(sessionFacets(NELSONS)).toEqual({
      type: "Coworking",
      district: "Paris 1er",
      ambiance: "Équilibré",
      quietLevel: "Modéré",
      powerOutlets: "Prises OK",
    });
  });

  it("leaves a dimension unsaid when the association rated nothing", () => {
    const facets = sessionFacets(BARE);
    expect(facets.ambiance).toBeUndefined();
    expect(facets.quietLevel).toBeUndefined();
    expect(facets.powerOutlets).toBeUndefined();
    // The type is always published; the district comes from the postcode.
    expect(facets.type).toBe("Coworking");
    expect(facets.district).toBe("Paris 5e");
  });

  it("recovers the district from the postcode when the column is empty", () => {
    expect(PANTIN.arrondissement).toBeNull();
    expect(HOXTON.arrondissement).toBeNull();
    // 51 of the 67 live sessions are resolved this way.
    expect(sessionFacets(NELSONS).district).toBe("Paris 1er");
    // …and neither of these two can be: one is outside Paris, one has no postcode.
    expect(sessionFacets(PANTIN).district).toBeUndefined();
    expect(sessionFacets(HOXTON).district).toBeUndefined();
  });

  it("recovers the district from the column when the address has no postcode", () => {
    // The other half of the 14/67-plus-51 recovery: `9 Quai de l’Oise 19e, Paris`
    // carries no postcode at all, and the column says 19.
    expect(OISE.adresse_lieu).toBe("9 Quai de l’Oise 19e, Paris");
    expect(sessionFacets(OISE).district).toBe("Paris 19e");
  });

  it("reads the one afterwork as an afterwork", () => {
    expect(sessionFacets(AFTERWORK).type).toBe("Afterwork");
  });

  it("says nothing for a code the catalogue does not know", () => {
    expect(sessionFacets({ ...NELSONS, ambiance: 4 }).ambiance).toBeUndefined();
  });
});

describe("facetTags", () => {
  it("tags a session with everything it published, and nothing it did not", () => {
    expect(facetTags(sessionFacets(NELSONS))).toEqual([
      "Coworking",
      "Paris 1er",
      "Équilibré",
      "Modéré",
      "Prises OK",
    ]);
    expect(facetTags(sessionFacets(BARE))).toEqual(["Coworking", "Paris 5e"]);
  });
});

// The invariant the whole design rests on. It is structural — the filter options
// and the tags are both `facetLabels`/`facetLabelOf` over one catalogue — and
// this test is what keeps it structural: hardcode an option list in `config.ts`,
// or spell a tag by hand in the extractor, and a source's filters stop agreeing
// with the events DataView's tag dimension.
describe("every filter option is a tag the extractor can emit", () => {
  const CATALOGUE: Record<
    CoworkmeetFilterKey,
    readonly { code: string | number; label: string }[]
  > = {
    types: COWORKMEET_SESSION_TYPES,
    districts: COWORKMEET_DISTRICTS,
    ambiances: COWORKMEET_AMBIANCES,
    quietLevels: COWORKMEET_QUIET_LEVELS,
    powerOutlets: COWORKMEET_POWER_OUTLETS,
  };

  for (const [key, catalog] of Object.entries(CATALOGUE)) {
    it(`holds for ${key}`, () => {
      const offered = coworkmeetSourceConfigFields[
        key as CoworkmeetFilterKey
      ].options.map((o) => o.value);
      // Producible: `facetLabelOf` can only ever answer with one of these.
      expect(offered).toEqual(facetLabels(catalog));
    });
  }

  it("offers each label exactly once, so a tag names one option", () => {
    for (const catalog of Object.values(CATALOGUE)) {
      const labels = facetLabels(catalog);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

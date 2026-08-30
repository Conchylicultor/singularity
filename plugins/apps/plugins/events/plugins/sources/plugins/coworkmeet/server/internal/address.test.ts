import { describe, expect, it } from "bun:test";
import { addressCity, postcodeDistrict } from "./address";

// Every address below is a real one from the live capture.

describe("postcodeDistrict", () => {
  it("reads the district out of a Paris postcode", () => {
    expect(postcodeDistrict("16 Rue Coquillière, 75001 Paris, France")).toBe(1);
    expect(postcodeDistrict("30 Av. Corentin Cariou, 75019 Paris")).toBe(19);
  });

  it("reads 75005 as the 5th, not the 50th", () => {
    // The whole reason the pattern takes THREE digits: `\b75(\d{2})\b` reads
    // this as district 50, which is out of range, so the district vanishes.
    expect(postcodeDistrict("7 Rue Lacépède, 75005 Paris")).toBe(5);
  });

  it("reads a postcode with no town after it", () => {
    expect(postcodeDistrict("25 rue mouton-duvernet 75014 ")).toBe(14);
    expect(postcodeDistrict("Pont de Javel Bas 75015 Paris")).toBe(15);
  });

  it("has no district for an address with no postcode", () => {
    expect(postcodeDistrict("30 Rue du Sentier")).toBeUndefined();
    expect(postcodeDistrict("9 Quai de l’Oise 19e, Paris")).toBeUndefined();
  });

  it("has no district outside Paris", () => {
    expect(
      postcodeDistrict("70 avenue du Général Leclerc, 93500 Pantin"),
    ).toBeUndefined();
  });

  it("has no district for a 75xxx that is not an arrondissement", () => {
    // 75116 is a real Post Office code for the western half of the 16th, and
    // this vocabulary has no entry for it.
    expect(postcodeDistrict("1 rue Test 75116 Paris")).toBeUndefined();
  });
});

describe("addressCity", () => {
  it("answers Paris for any 75xxx, however the address spells the city", () => {
    expect(addressCity("16 Rue Coquillière, 75001 Paris, France")).toBe(
      "Paris",
    );
    expect(addressCity("40 boulevard de Reuilly, 75012 paris ")).toBe("Paris");
    expect(addressCity("14 rue Alphonse Baudin 75011")).toBe("Paris");
    expect(addressCity("Pont de Javel Bas 75015 Paris")).toBe("Paris");
  });

  it("names the town when it is not Paris", () => {
    expect(addressCity("70 avenue du Général Leclerc, 93500 Pantin")).toBe(
      "Pantin",
    );
  });

  it("says nothing when the address names no postcode", () => {
    expect(addressCity("30 Rue du Sentier")).toBeUndefined();
    expect(addressCity("9 Quai de l’Oise 19e, Paris")).toBeUndefined();
  });
});

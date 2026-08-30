import { describe, expect, it } from "bun:test";
import { sessionDescription } from "./description";
import {
  BARE,
  DUPLICATE_NOTE,
  HOXTON,
  NELSONS,
  PENICHE_ANNETTE,
  ROUND_PRICE,
} from "./fixtures";

describe("sessionDescription", () => {
  it("prints the association's note, then the facts the tags do not carry", () => {
    expect(sessionDescription(NELSONS)).toBe(
      "Nelson's\n13 of 16 signed up · Host: Team CoworkMeet",
    );
  });

  it("says nothing when the association published nothing worth saying", () => {
    // No note, no host, nobody signed up and no capacity — `0 signed up` is the
    // state every session starts in and reports nothing.
    expect(sessionDescription(BARE)).toBeUndefined();
    expect(sessionDescription(PENICHE_ANNETTE)).toBeUndefined();
  });

  it("prints a full house even when nobody has been named", () => {
    expect(sessionDescription(HOXTON)).toBe(
      "Places limitées.\nPrévoir laptop chargé.\n8 of 8 signed up",
    );
  });

  it("prints one copy when the two notes are the same sentence", () => {
    // A live pair: this session's `note_lieu` and `description_session` are
    // character-for-character identical.
    expect(DUPLICATE_NOTE.note_lieu).toBe(DUPLICATE_NOTE.description_session);
    expect(sessionDescription(DUPLICATE_NOTE)).toBe(
      "Coworking ce jour dans ce restaurant central (organisation de dernière minute)\n10 signed up",
    );
  });

  it("prints both notes when each says something the other does not", () => {
    expect(sessionDescription(ROUND_PRICE)).toBe(
      [
        "Lieu exceptionnel",
        "Déjeuner convivial + coworking focus + Afterwork pour ceux qui veulent",
        "Il y aura des Freelances venant d’autres communautés",
        "Déj & coworking & afterwork",
        "10 of 16 signed up · Host: Perrine Huon",
      ].join("\n"),
    );
  });

  it("drops the shorter of two notes when one contains the other", () => {
    expect(
      sessionDescription({
        ...NELSONS,
        description_session: "Coworking au Nelson's, venez nombreux",
        note_lieu: "Coworking au Nelson's",
        referent_name: null,
        max_participants: null,
        session_registrations: [{ count: 0 }],
      }),
    ).toBe("Coworking au Nelson's, venez nombreux");
  });

  it("never repeats the venue's ratings, which are already tags", () => {
    const text = sessionDescription(NELSONS) ?? "";
    for (const rating of ["Modéré", "Équilibré", "Prises OK"]) {
      expect(text).not.toContain(rating);
    }
  });
});

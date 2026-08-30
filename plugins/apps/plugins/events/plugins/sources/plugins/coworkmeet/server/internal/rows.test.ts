import { describe, expect, it } from "bun:test";
import { registrationCount, SessionPageSchema, SessionRowSchema } from "./rows";

// The live payload, byte-for-byte as PostgREST served it on 2026-08-30 —
// including `latitude` / `longitude`, which this type does not select and which
// zod therefore strips. Kept in the fixture so the test proves the schema
// tolerates the whole real response rather than a version tidied to fit it.
const LIVE_ROW = {
  id: "b53542dd-18a0-43a4-bd3c-6ed104e585ed",
  nom_lieu: "Le Nelson’s",
  adresse_lieu: "16 Rue Coquillière, 75001 Paris, France",
  date_session: "2026-09-10",
  heure_debut: "14:30:00",
  heure_fin: "18:00:00",
  latitude: 48.8636832,
  longitude: 2.3430299,
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/6022f67e-a141-4088-9e96-e05025bc8730_1787126154190.jpg",
  note_lieu: "Nelson's",
  description_session: null,
  max_participants: 16,
  prix_conso: null,
  referent_name: "Team CoworkMeet",
  niveau_calme: 2,
  ambiance: 2,
  disponibilite_prises: 2,
  event_type: "coworking",
  arrondissement: 1,
  session_registrations: [{ count: 13 }],
};

/** The other live shape: a session the association has told us nothing about. */
const SPARSE_ROW = {
  ...LIVE_ROW,
  id: "436f89c6-d5c9-4747-92e1-64a45965ecc3",
  note_lieu: null,
  max_participants: null,
  referent_name: null,
  niveau_calme: null,
  ambiance: null,
  disponibilite_prises: null,
  arrondissement: null,
  session_registrations: [{ count: 0 }],
};

describe("SessionRowSchema", () => {
  it("parses a live row", () => {
    const parsed = SessionRowSchema.parse(LIVE_ROW);
    expect(parsed.nom_lieu).toBe("Le Nelson’s");
    expect(parsed.arrondissement).toBe(1);
  });

  it("parses the sparse live row, where half the columns are null", () => {
    const parsed = SessionRowSchema.parse(SPARSE_ROW);
    expect(parsed.niveau_calme).toBeNull();
    expect(registrationCount(parsed)).toBe(0);
  });

  it("rejects a row missing a field the extractor needs to place it in time", () => {
    const { heure_debut: _dropped, ...rest } = LIVE_ROW;
    expect(SessionRowSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a null in a field that is never null upstream", () => {
    // The difference that matters: `note_lieu: null` is published data, while
    // `date_session: null` would be a session with no date — a shape change that
    // must park the source rather than mint an event at the epoch.
    expect(
      SessionRowSchema.safeParse({ ...LIVE_ROW, date_session: null }).success,
    ).toBe(false);
  });

  it("reads a page as a bare array", () => {
    expect(SessionPageSchema.parse([LIVE_ROW, SPARSE_ROW])).toHaveLength(2);
  });
});

describe("registrationCount", () => {
  it("reads the count out of PostgREST's one-row aggregate array", () => {
    expect(registrationCount(SessionRowSchema.parse(LIVE_ROW))).toBe(13);
  });

  it("is unknown — not zero — when the aggregate itself is absent", () => {
    const parsed = SessionRowSchema.parse({
      ...LIVE_ROW,
      session_registrations: [],
    });
    expect(registrationCount(parsed)).toBeUndefined();
  });
});

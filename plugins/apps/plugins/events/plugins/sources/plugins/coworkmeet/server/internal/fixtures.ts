import type { SessionRow } from "./rows";

// Real rows from the association's live listing, captured verbatim on
// 2026-08-30 (67 rows). Chosen because each one is a case the mapping has to get
// right, and left exactly as published — the trailing spaces, the hotel stars,
// the missing postcodes and the duplicated notes are the data, not noise to tidy
// before testing against it.
//
// `latitude` / `longitude` are the only columns dropped: this type does not
// select them (see `probe.ts`).

/** A fully-rated session: every indicator filled, 13 of 16 signed up, hosted. */
export const NELSONS: SessionRow = {
  id: "b53542dd-18a0-43a4-bd3c-6ed104e585ed",
  nom_lieu: "Le Nelson’s",
  adresse_lieu: "16 Rue Coquillière, 75001 Paris, France",
  date_session: "2026-09-10",
  heure_debut: "14:30:00",
  heure_fin: "18:00:00",
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
  session_registrations: [
    {
      count: 13,
    },
  ],
};

/** A session with nothing filled in but the six fields that place it in time and space. */
export const BARE: SessionRow = {
  id: "436f89c6-d5c9-4747-92e1-64a45965ecc3",
  nom_lieu: "Bibie Paris",
  adresse_lieu: "7 Rue Lacépède, 75005 Paris",
  date_session: "2025-10-14",
  heure_debut: "14:00:00",
  heure_fin: "18:30:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/session-photos/0vputfqnrc2g-1759412545372.jpeg",
  note_lieu: null,
  description_session: null,
  max_participants: null,
  prix_conso: null,
  referent_name: null,
  niveau_calme: null,
  ambiance: null,
  disponibilite_prises: null,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 0,
    },
  ],
};

/** The one live afterwork — and its venue is literally called `AFTERWORK CoworkMeet`. */
export const AFTERWORK: SessionRow = {
  id: "9b8f5801-181d-44f0-8db9-f446ad10dfcc",
  nom_lieu: "AFTERWORK CoworkMeet",
  adresse_lieu: "16 Rue Coquillière, 75001 Paris, France",
  date_session: "2026-06-18",
  heure_debut: "18:00:00",
  heure_fin: "19:30:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/6022f67e-a141-4088-9e96-e05025bc8730_1776404784100.jpg",
  note_lieu: "Afterwork ",
  description_session: null,
  max_participants: 18,
  prix_conso: null,
  referent_name: "Team CoworkMeet ",
  niveau_calme: 1,
  ambiance: 3,
  disponibilite_prises: null,
  event_type: "afterwork",
  arrondissement: 1,
  session_registrations: [
    {
      count: 13,
    },
  ],
};

/** Not in Paris. The reason `city` is never defaulted and `arrondissement` is never assumed. */
export const PANTIN: SessionRow = {
  id: "82a48548-e007-42eb-bd48-5c83941cf6f7",
  nom_lieu: "Hôtel Tribe Pantin",
  adresse_lieu: "70 avenue du Général Leclerc, 93500 Pantin",
  date_session: "2026-02-19",
  heure_debut: "14:00:00",
  heure_fin: "18:30:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/322b5f56-06f7-49cb-9094-fe6420a6d99e_1770742792036.jpg",
  note_lieu: "8€ = 2 boissons chaudes☕",
  description_session: null,
  max_participants: 5,
  prix_conso: 4.0,
  referent_name: null,
  niveau_calme: 2,
  ambiance: 2,
  disponibilite_prises: 3,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 2,
    },
  ],
};

/** An address with no postcode at all, and a hotel that publishes its stars. */
export const HOXTON: SessionRow = {
  id: "2811fe84-6319-4e7b-8ea7-2c56a875b836",
  nom_lieu: "Hôtel The Hoxton ****",
  adresse_lieu: "30 Rue du Sentier",
  date_session: "2026-02-03",
  heure_debut: "14:30:00",
  heure_fin: "18:30:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/6022f67e-a141-4088-9e96-e05025bc8730_1769603991765.jpg",
  note_lieu: "Places limitées. \nPrévoir laptop chargé.",
  description_session: null,
  max_participants: 8,
  prix_conso: 4.0,
  referent_name: null,
  niveau_calme: 2,
  ambiance: 2,
  disponibilite_prises: 1,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 8,
    },
  ],
};

/** A venue name with a trailing space, and an address with a postcode but no town after it. */
export const PENICHE_ANNETTE: SessionRow = {
  id: "5588756f-bae4-484a-9975-761f2fb85f3d",
  nom_lieu: "Péniche Annette K ",
  adresse_lieu: "Pont de Javel Bas 75015 Paris",
  date_session: "2025-12-03",
  heure_debut: "09:00:00",
  heure_fin: "18:00:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/6022f67e-a141-4088-9e96-e05025bc8730_1764580056517.jpg",
  note_lieu: null,
  description_session: null,
  max_participants: null,
  prix_conso: null,
  referent_name: null,
  niveau_calme: null,
  ambiance: null,
  disponibilite_prises: null,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 0,
    },
  ],
};

/** Stars in the venue name, lower-case `paris`-less address, `prix_conso` a round 4. */
export const MERCURE: SessionRow = {
  id: "09a3b241-3c82-4f76-90cb-2bf977bbb9f0",
  nom_lieu: "Hôtel Mercure Montparnasse****",
  adresse_lieu: "20 rue de la gaîté 75014 Paris",
  date_session: "2026-01-29",
  heure_debut: "14:00:00",
  heure_fin: "18:00:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/6022f67e-a141-4088-9e96-e05025bc8730_1768640293075.jpg",
  note_lieu: null,
  description_session: null,
  max_participants: 8,
  prix_conso: 4.0,
  referent_name: null,
  niveau_calme: 3,
  ambiance: 1,
  disponibilite_prises: 2,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 6,
    },
  ],
};

/** No postcode, but the `arrondissement` column knows: the 14/67-plus-51 recovery, from the column side. */
export const OISE: SessionRow = {
  id: "f050d46b-fd58-4cbb-a997-a7c994f3d93b",
  nom_lieu: "Péniche L’Eau et les Rêves",
  adresse_lieu: "9 Quai de l’Oise 19e, Paris",
  date_session: "2026-06-17",
  heure_debut: "11:00:00",
  heure_fin: "19:00:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/2c2876ba-babe-4351-a31c-1b3ddb4ca1b3_1780898735457.jpg",
  note_lieu: "Premier test de ce lieu atypique. Soyez prêt.e à tout !",
  description_session: null,
  max_participants: 8,
  prix_conso: null,
  referent_name: null,
  niveau_calme: 2,
  ambiance: 2,
  disponibilite_prises: null,
  event_type: "coworking",
  arrondissement: 19,
  session_registrations: [
    {
      count: 6,
    },
  ],
};

/** `note_lieu` and `description_session` are the SAME sentence. */
export const DUPLICATE_NOTE: SessionRow = {
  id: "2ab98ea7-0f3f-4764-a455-ac3fe3d6388e",
  nom_lieu: "Le Nelson’s",
  adresse_lieu: "16 Rue Coquillière 75001 Paris",
  date_session: "2026-03-19",
  heure_debut: "14:30:00",
  heure_fin: "18:00:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/2c2876ba-babe-4351-a31c-1b3ddb4ca1b3_1773907206763.jpg",
  note_lieu:
    "Coworking ce jour dans ce restaurant central (organisation de dernière minute)",
  description_session:
    "Coworking ce jour dans ce restaurant central (organisation de dernière minute)",
  max_participants: null,
  prix_conso: 2.0,
  referent_name: null,
  niveau_calme: 2,
  ambiance: 3,
  disponibilite_prises: 2,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 10,
    },
  ],
};

/** `prix_conso` with cents (2.2), which must print as €2.20. */
export const CENTS: SessionRow = {
  id: "344c6df8-787d-4fed-b8a3-90bc269f0e08",
  nom_lieu: "La Fèlicita",
  adresse_lieu: "5 Parvis Alan Turing, 75013 Paris",
  date_session: "2026-02-05",
  heure_debut: "14:30:00",
  heure_fin: "18:30:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/6022f67e-a141-4088-9e96-e05025bc8730_1768640775892.jpg",
  note_lieu: "Prévoir laptop chargé",
  description_session: null,
  max_participants: 12,
  prix_conso: 2.2,
  referent_name: null,
  niveau_calme: 1,
  ambiance: 3,
  disponibilite_prises: 1,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 11,
    },
  ],
};

/** Two different notes that both say something, and a round €6. */
export const ROUND_PRICE: SessionRow = {
  id: "570c109b-a268-4bb3-9ee8-4ba42bcc1eea",
  nom_lieu: "Péniche Annette K ",
  adresse_lieu: "Pont de Javel Bas 75015 Paris",
  date_session: "2026-03-06",
  heure_debut: "10:00:00",
  heure_fin: "18:00:00",
  photo_url:
    "https://zouzqrendnialuqtmorh.supabase.co/storage/v1/object/public/images/sessions/6022f67e-a141-4088-9e96-e05025bc8730_1771369165912.jpg",
  note_lieu: "Déj & coworking & afterwork",
  description_session:
    "Lieu exceptionnel \nDéjeuner convivial + coworking focus + Afterwork pour ceux qui veulent \nIl y aura des Freelances venant d’autres communautés ",
  max_participants: 16,
  prix_conso: 6.0,
  referent_name: "Perrine Huon",
  niveau_calme: 3,
  ambiance: 1,
  disponibilite_prises: 1,
  event_type: "coworking",
  arrondissement: null,
  session_registrations: [
    {
      count: 10,
    },
  ],
};

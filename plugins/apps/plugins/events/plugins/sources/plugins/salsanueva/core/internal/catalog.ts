// The school's own vocabulary, copied verbatim from what its courses API
// currently serves. Every string here is an EXACT upstream value: the filters
// compare with `===` against the JSON, and the same strings are what the site's
// own planning page accepts in its query string.
//
// Do not tidy them. `Hip Hop` and `Hip-Hop` are two live activities, and
// `Classique -Initiation` really is missing the space — normalizing either one
// would produce a filter that matches nothing.
//
// ## This list is a snapshot, and that is a known cost
//
// A dance school re-publishes its catalogue every season, so a value can leave.
// `tagsField` keeps a stored selection the menu no longer offers (it renders as
// a `label ?` chip you can un-pick), and `extract` reports a selection that
// matched no course in the run's caveats — so a stale entry is loud rather than
// a source that silently goes empty. Refreshing the lists is then a one-file
// edit here.
//
// Regenerate by reading the API once and taking the distinct values:
//   curl -s 'https://salsanueva.fr/wp-json/v1/blb/courses?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&club_id=13958&booking_type=bs&v=2'

/** `Adulte` / `Enfant` — the school teaches both off one schedule. */
export const SALSANUEVA_TYPES = ["Adulte", "Enfant"] as const;

/** The studios. Both are Paris; the address on each course row carries the rest. */
export const SALSANUEVA_LOCATIONS = [
  "SalsaNueva 12è",
  "SalsaNueva 20è",
] as const;

/** The broad dance family. */
export const SALSANUEVA_ACTIVITIES = [
  "Afro",
  "Bachata",
  "Body Movement",
  "Classique",
  "Dance Clip",
  "Dancehall",
  "Danse Orientale",
  "Heels",
  "Hip Hop",
  "Hip-Hop",
  "K-Pop",
  "Kizomba",
  "Modern Jazz",
  "Modern Jazz Adultes",
  "Pilates",
  "Reggaeton",
  "Salsa Colombienne",
  "Salsa Cubaine",
  "Salsa Portoricaine",
  "Samba",
  "Street Jazz",
] as const;

/** The specific style within a family (`Bachata` → `Bachata Sensual`, …). */
export const SALSANUEVA_SUB_ACTIVITIES = [
  "Afro",
  "Bachata Dominicaine",
  "Bachata Moderna",
  "Bachata Sensual",
  "Bachazouk",
  "Body Movement",
  "Classique - Débutant",
  "Classique - Éveil 1",
  "Classique - Éveil 2",
  "Classique -Initiation",
  "Dance Clip - Hip Hop",
  "DanceHall Female",
  "DanceHall Mix",
  "Danse Orientale",
  "Heels Cabaret",
  "Heels Commercial",
  "Hip Hop Commercial",
  "Hip-Hop Commercial",
  "K-Pop",
  "Modern Jazz",
  "Pilates",
  "Reggaeton",
  "Salsa Colombienne",
  "Salsa Cubaine",
  "Salsa Porto",
  "Salsa Porto On1",
  "Salsa Porto On2",
  "Salsa Shines On2",
  "Samba Brésilienne",
  "Sexy Heels",
  "Sexy Reggaeton",
  "Street Jazz",
  "Urban Kiz",
] as const;

/**
 * Ordered by progression, then by age — the order the chips are drawn in, so a
 * reader scans a ladder rather than an alphabet. The children's courses use age
 * brackets where the adults' use levels; both live in this one upstream field.
 */
export const SALSANUEVA_LEVELS = [
  "Initiation",
  "Débutant",
  "Débutant-Inter",
  "Intermédiaire",
  "Inter",
  "Ts niveaux",
  "4-5 ans",
  "5-6 ans",
  "6-7 ans",
  "7-8 ans",
  "7-9 ans",
  "8-10 ans",
  "10-12 ans",
  "10-15 ans",
  "12-17 ans",
] as const;

/** Teachers, as the school spells them. The most volatile list here. */
export const SALSANUEVA_COACHES = [
  "Adèle",
  "Agnès",
  "Aude",
  "Audrey",
  "Clara",
  "Clément",
  "CyGy",
  "Elia",
  "Elodie",
  "Elsa",
  "Guillem",
  "Issam",
  "Ivan",
  "Jerry",
  "Juliette",
  "Kevin",
  "Laetizia",
  "Lorenzo",
  "Lucy",
  "Lydie",
  "Masato",
  "Maéva",
  "Mika",
  "Nicholas",
  "Nicolas",
  "Sabrine",
  "Samuel",
  "Sara",
  "Stéphane",
  "Tcheleka",
  "Willy",
  "Électre",
] as const;

/**
 * Monday-first, in French, because these are the literal values the site's own
 * `days=` query parameter takes — the same strings this source's `originUrl`
 * hands back to it.
 *
 * Index IS the weekday: position 0 is Monday, matching `event-date`'s `WEEKDAYS`.
 */
export const SALSANUEVA_DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

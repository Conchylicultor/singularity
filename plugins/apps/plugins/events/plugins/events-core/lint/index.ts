import noRawEventsWrite from "./no-raw-events-write";

export default {
  name: "events",
  rules: {
    "no-raw-events-write": noRawEventsWrite,
  },
  ignores: {
    // `events-repo.ts` IS the funnel — it owns the `updated_at` stamp every
    // other writer must route through.
    "no-raw-events-write": [
      "plugins/apps/plugins/events/plugins/events-core/server/internal/events-repo.ts",
    ],
  },
};

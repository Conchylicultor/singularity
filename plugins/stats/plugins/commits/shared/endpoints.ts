import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// `defineEndpoint` requires the query schema's input and output types to match
// (and infers cleanly only for effect-free schemas), so query params are modeled
// as plain string enums — no `.default()`/`.transform()`/`.preprocess()`. The web
// client serialises each value with String(value), so a boolean becomes the
// literal "true"/"false" on the wire, which this enum accepts. Handlers convert
// `dedup === "true"` to a boolean and default `bucket` to "day". Each field is
// optional: an omitted param is dropped client-side and read as undefined.
const dedupQuery = z.enum(["true", "false"]).optional();

const bucketQuery = z
  .enum(["hour", "day", "week", "month", "year"])
  .optional();

// --- Commits (counts) ---

const commitsPlainPoint = z.object({ date: z.string(), count: z.number() });
const commitsCategoryPoint = z.object({
  date: z.string(),
  byCategory: z.record(z.string(), z.number()),
});

export const getCommitsCumulative = defineEndpoint({
  route: "GET /api/stats/commits/cumulative",
  query: z.object({
    breakdown: z.literal("category").optional(),
    dedup: dedupQuery,
  }),
  response: z.union([
    z.object({ points: z.array(commitsPlainPoint) }),
    z.object({
      points: z.array(commitsCategoryPoint),
      categories: z.array(z.string()),
    }),
  ]),
});

const ratePlainPoint = z.object({ bucket: z.string(), count: z.number() });
const rateCategoryPoint = z.object({
  bucket: z.string(),
  byCategory: z.record(z.string(), z.number()),
});

export const getCommitsRate = defineEndpoint({
  route: "GET /api/stats/commits/rate",
  query: z.object({
    bucket: bucketQuery,
    breakdown: z.literal("category").optional(),
    dedup: dedupQuery,
  }),
  response: z.union([
    z.object({ bucket: z.string(), points: z.array(ratePlainPoint) }),
    z.object({
      bucket: z.string(),
      points: z.array(rateCategoryPoint),
      categories: z.array(z.string()),
    }),
  ]),
});

// --- Lines (added/removed) ---

const linesDelta = z.object({ added: z.number(), removed: z.number() });

const linesCumPlainPoint = z.object({
  date: z.string(),
  added: z.number(),
  removed: z.number(),
});
const linesCumExtPoint = z.object({
  date: z.string(),
  byExt: z.record(z.string(), linesDelta),
});

export const getCommitsLinesCumulative = defineEndpoint({
  route: "GET /api/stats/commits/lines/cumulative",
  query: z.object({
    breakdown: z.literal("ext").optional(),
    dedup: dedupQuery,
  }),
  response: z.union([
    z.object({ points: z.array(linesCumPlainPoint) }),
    z.object({ points: z.array(linesCumExtPoint) }),
  ]),
});

const linesRatePlainPoint = z.object({
  bucket: z.string(),
  added: z.number(),
  removed: z.number(),
});
const linesRateExtPoint = z.object({
  bucket: z.string(),
  byExt: z.record(z.string(), linesDelta),
});

export const getCommitsLinesRate = defineEndpoint({
  route: "GET /api/stats/commits/lines/rate",
  query: z.object({
    bucket: bucketQuery,
    breakdown: z.literal("ext").optional(),
    dedup: dedupQuery,
  }),
  response: z.union([
    z.object({ bucket: z.string(), points: z.array(linesRatePlainPoint) }),
    z.object({ bucket: z.string(), points: z.array(linesRateExtPoint) }),
  ]),
});

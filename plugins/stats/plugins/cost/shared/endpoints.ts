import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// `defineEndpoint` requires the query schema's input and output types to match
// (and infers cleanly only for effect-free schemas), so query params are modeled
// as plain optional strings/enums — no `.default()`/`.transform()`/`.preprocess()`.
// The web client serialises each value with String(value), so values arrive
// server-side as strings. Handlers default `scope` to "singularity" and parse
// `limit` (a string) to a number, defaulting to 50.
const scopeQuery = z.enum(["all", "singularity"]).optional();

export const getCostDaily = defineEndpoint({
  route: "GET /api/stats/cost/daily",
  query: z.object({ scope: scopeQuery }),
  response: z.object({
    points: z.array(
      z.object({
        date: z.string(),
        byModel: z.record(z.string(), z.number()),
      }),
    ),
    models: z.array(z.string()),
  }),
});

export const getCostDailyByFamily = defineEndpoint({
  route: "GET /api/stats/cost/daily-by-family",
  query: z.object({ scope: scopeQuery }),
  response: z.object({
    points: z.array(
      z.object({
        date: z.string(),
        byFamily: z.record(z.string(), z.number()),
      }),
    ),
    families: z.array(z.string()),
  }),
});

export const getCostCumulative = defineEndpoint({
  route: "GET /api/stats/cost/cumulative",
  query: z.object({ scope: scopeQuery }),
  response: z.object({
    points: z.array(z.object({ date: z.string(), cost: z.number() })),
  }),
});

export const getCostTokenMix = defineEndpoint({
  route: "GET /api/stats/cost/token-mix",
  query: z.object({ scope: scopeQuery }),
  response: z.object({
    points: z.array(
      z.object({
        date: z.string(),
        input: z.number(),
        output: z.number(),
        cacheCreation: z.number(),
        cacheRead: z.number(),
      }),
    ),
  }),
});

export const getCostTotals = defineEndpoint({
  route: "GET /api/stats/cost/totals",
  query: z.object({ scope: scopeQuery }),
  response: z.object({
    totalCost: z.number(),
    totalTokens: z.number(),
    byTokenKind: z.object({
      input: z.number(),
      output: z.number(),
      cacheCreation: z.number(),
      cacheRead: z.number(),
    }),
    last7Cost: z.number(),
    avgDailyCost: z.number(),
    activeDays: z.number(),
    sessionCount: z.number(),
  }),
});

export const getCostSessions = defineEndpoint({
  route: "GET /api/stats/cost/sessions",
  query: z.object({ scope: scopeQuery, limit: z.string().optional() }),
  response: z.object({
    rows: z.array(
      z.object({
        sessionId: z.string(),
        conversationId: z.string().nullable(),
        title: z.string().nullable(),
        status: z.string().nullable(),
        totalCost: z.number(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheCreationTokens: z.number(),
        cacheReadTokens: z.number(),
        lastActivity: z.string(),
        modelsUsed: z.array(z.string()),
      }),
    ),
  }),
});

export const getCostDistribution = defineEndpoint({
  route: "GET /api/stats/cost/distribution",
  query: z.object({ scope: scopeQuery }),
  response: z.object({
    buckets: z.array(z.object({ label: z.string(), count: z.number() })),
  }),
});

const avgFamilyEntry = z.object({ avgCost: z.number(), avgTokens: z.number() });
const avgRolling7Family = z.object({
  cost: z.number().nullable(),
  tokens: z.number().nullable(),
});

export const getCostAvgPerConversation = defineEndpoint({
  route: "GET /api/stats/cost/avg-per-conversation",
  query: z.object({ scope: scopeQuery }),
  response: z.object({
    points: z.array(
      z.object({
        date: z.string(),
        avgCost: z.number(),
        avgTokens: z.number(),
        sessionCount: z.number(),
        byFamily: z.record(z.string(), avgFamilyEntry),
        rolling7ByFamily: z.record(z.string(), avgRolling7Family),
        rolling7Cost: z.number().nullable(),
        rolling7Tokens: z.number().nullable(),
      }),
    ),
    families: z.array(z.string()),
  }),
});

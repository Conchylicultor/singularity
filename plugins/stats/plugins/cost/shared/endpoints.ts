import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getCostDaily = defineEndpoint({
  route: "GET /api/stats/cost/daily",
});

export const getCostDailyByFamily = defineEndpoint({
  route: "GET /api/stats/cost/daily-by-family",
});

export const getCostCumulative = defineEndpoint({
  route: "GET /api/stats/cost/cumulative",
});

export const getCostTokenMix = defineEndpoint({
  route: "GET /api/stats/cost/token-mix",
});

export const getCostTotals = defineEndpoint({
  route: "GET /api/stats/cost/totals",
});

export const getCostSessions = defineEndpoint({
  route: "GET /api/stats/cost/sessions",
});

export const getCostDistribution = defineEndpoint({
  route: "GET /api/stats/cost/distribution",
});

export const getCostAvgPerConversation = defineEndpoint({
  route: "GET /api/stats/cost/avg-per-conversation",
});

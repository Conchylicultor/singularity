import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getCommitsCumulative = defineEndpoint({
  route: "GET /api/stats/commits/cumulative",
});

export const getCommitsRate = defineEndpoint({
  route: "GET /api/stats/commits/rate",
});

export const getCommitsLinesCumulative = defineEndpoint({
  route: "GET /api/stats/commits/lines/cumulative",
});

export const getCommitsLinesRate = defineEndpoint({
  route: "GET /api/stats/commits/lines/rate",
});

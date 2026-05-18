import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Note: these endpoints handle binary (image/png) request/response bodies
// and are not wrapped with implement() — the raw handlers are used directly.
export const createScreenshot = defineEndpoint({
  route: "POST /api/screenshots/:id",
});

export const getScreenshot = defineEndpoint({
  route: "GET /api/screenshots/:id",
});

export const saveScreenshotFile = defineEndpoint({
  route: "POST /api/screenshots/:id/file",
});

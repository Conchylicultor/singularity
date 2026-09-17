import { db } from "@plugins/database/server";
import type { HttpHandler } from "@plugins/framework/plugins/server-core/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { lookupCountry } from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/ip-country/server";
import {
  hostOnly,
  requestClientIp,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/host-only/server";
import {
  MAX_COLLECT_BODY_BYTES,
  analyticsQueryEndpoint,
  collectEndpoint,
} from "../../core";
import { recordCollect } from "./collect";
import { runAnalyticsQuery } from "./report";

/**
 * Refuse a public request body over `maxBytes` before it is read. The declared
 * length is required: every browser `fetch` with a string body sends one, and
 * without it the size is unknowable until the whole body has been buffered.
 */
function capBodySize(maxBytes: number, handler: HttpHandler): HttpHandler {
  return (req, params) => {
    const declared = req.headers.get("content-length");
    if (declared === null) {
      return new Response("Length required", { status: 411 });
    }
    const bytes = Number(declared);
    if (!Number.isInteger(bytes) || bytes < 0) {
      return new Response("Bad Content-Length", { status: 400 });
    }
    if (bytes > maxBytes) {
      return new Response("Payload too large", { status: 413 });
    }
    return handler(req, params);
  };
}

export const handleCollect = capBodySize(
  MAX_COLLECT_BODY_BYTES,
  implement(collectEndpoint, ({ body, req }) =>
    recordCollect(
      db,
      body,
      {
        ip: requestClientIp(req),
        userAgent: req.headers.get("user-agent") ?? "",
        acceptLanguage: req.headers.get("accept-language"),
        now: new Date(),
      },
      lookupCountry,
    ),
  ),
);

export const handleAnalyticsQuery = hostOnly(
  implement(analyticsQueryEndpoint, ({ query }) =>
    runAnalyticsQuery(db, query.q, new Date()),
  ),
);

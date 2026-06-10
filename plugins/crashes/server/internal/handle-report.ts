import { recordCrash } from "./record-crash";
import type { CrashSource } from "../../shared/types";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { reportCrash } from "../../shared/endpoints";

const VALID_SOURCES: ReadonlySet<CrashSource> = new Set([
  "browser-error",
  "browser-rejection",
  "react-boundary",
  "client-endpoint",
]);

export const handleReport = implement(reportCrash, async ({ body }) => {
  if (!VALID_SOURCES.has(body.source as CrashSource)) {
    throw new HttpError(400, "Invalid source");
  }
  const result = await recordCrash({
    source: body.source as CrashSource,
    message: body.message,
    errorType: body.errorType ?? null,
    stack: body.stack ?? null,
    componentStack: body.componentStack ?? null,
    url: body.url ?? null,
    userAgent: body.userAgent ?? null,
    slot: body.slot ?? null,
    label: body.label ?? null,
    clientId: body.clientId ?? null,
    buildId: body.buildId ?? null,
  });
  return result;
});

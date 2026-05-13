import { recordCrash } from "./record-crash";
import type { CrashReport, CrashSource } from "@plugins/crashes/shared/types";

const VALID_SOURCES: ReadonlySet<CrashSource> = new Set([
  "browser-error",
  "browser-rejection",
  "react-boundary",
]);

export async function handleReport(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Partial<CrashReport>;
  if (!body.message || typeof body.message !== "string") {
    return new Response("Missing message", { status: 400 });
  }
  if (!body.source || !VALID_SOURCES.has(body.source as CrashSource)) {
    return new Response("Invalid source", { status: 400 });
  }
  const result = await recordCrash({
    source: body.source as CrashSource,
    message: body.message,
    errorType: typeof body.errorType === "string" ? body.errorType : null,
    stack: typeof body.stack === "string" ? body.stack : null,
    componentStack:
      typeof body.componentStack === "string" ? body.componentStack : null,
    url: typeof body.url === "string" ? body.url : null,
    userAgent: typeof body.userAgent === "string" ? body.userAgent : null,
    slot: typeof body.slot === "string" ? body.slot : null,
    label: typeof body.label === "string" ? body.label : null,
  });
  return Response.json(result);
}

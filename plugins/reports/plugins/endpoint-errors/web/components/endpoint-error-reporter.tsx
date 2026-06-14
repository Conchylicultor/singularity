import { useEffect } from "react";
import {
  registerEndpointErrorReporter,
  type EndpointErrorInfo,
} from "@plugins/infra/plugins/endpoints/web";
import { report } from "@plugins/reports/web";

interface ValidationBody {
  error: string;
  issues: { path: (string | number)[]; message: string }[];
}

// A 400 is only "bug-shaped" when it's a schema validation failure from the
// endpoints layer. Other 400s (e.g. the block editor's "no previous sibling
// to merge" HttpError, whose body is a plain string) are legitimate control
// flow and must NOT file a crash — so we require the validation body shape,
// never a bare status === 400.
function asValidationBody(body: unknown): ValidationBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.error !== "Validation failed" && b.error !== "Query validation failed") return null;
  if (!Array.isArray(b.issues)) return null;
  return b as unknown as ValidationBody;
}

function issuePath(path: (string | number)[]): string {
  return path.map(String).join(".") || "(root)";
}

function buildReport(info: EndpointErrorInfo) {
  const { route, status, body } = info;
  const validation = status === 400 ? asValidationBody(body) : null;

  let errorType: string;
  let message: string;
  if (validation) {
    // Sort + dedupe the issue paths so the fingerprint is stable regardless of
    // Zod's traversal order — one crash task per (route, status, field-set).
    const paths = [...new Set(validation.issues.map((i) => issuePath(i.path)))].sort();
    errorType = `EndpointError ${status} ${route} (${paths.join(", ")})`;
    message = validation.issues
      .map((i) => `${issuePath(i.path)}: ${i.message}`)
      .join("; ");
  } else {
    errorType = `EndpointError ${status} ${route}`;
    message =
      typeof body === "string" ? body : body == null ? `HTTP ${status}` : JSON.stringify(body);
  }

  return {
    kind: "crash" as const,
    source: "client-endpoint" as const,
    message,
    url: window.location.href,
    userAgent: navigator.userAgent,
    data: { errorType, stack: null },
  };
}

export function EndpointErrorReporter() {
  useEffect(() => {
    registerEndpointErrorReporter((info) => {
      // Bug-shaped only: all 5xx, plus validation 400s. Skip expected
      // control-flow responses (401/403/404/409, non-validation 400s).
      const bugShaped =
        info.status >= 500 || (info.status === 400 && asValidationBody(info.body) !== null);
      if (!bugShaped) return;
      void report(buildReport(info));
    });
    return () => registerEndpointErrorReporter(null);
  }, []);

  return null;
}

import type { EndpointDef } from "../../core/define-endpoint";
import { extractMethod, interpolatePath } from "../../core/route-params";
import { endpointErrorSink } from "./error-reporter";

export class EndpointError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

export function getEndpointErrorMessage(error: unknown): string {
  if (error instanceof EndpointError) {
    const { body } = error;
    // `HttpError` serializes as `new Response(err.message)` — plain text — and
    // `fetchEndpoint` falls back to `res.text()`, so its message arrives here
    // as a string. Without this branch every one of those messages was
    // discarded in favour of `EndpointError`'s hardcoded `HTTP <status>`.
    if (typeof body === "string" && body.trim()) return body;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
    ) {
      return (body as { message: string }).message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

type FetchOpts<TBody, TQuery> = {
  signal?: AbortSignal;
  /** RequestInit passthrough; lets a beacon survive page unload. */
  keepalive?: boolean;
  /** Default true. `false` skips endpointErrorSink.emit (e.g. the crash beacon). */
  report?: boolean;
  // `[T] extends [void]` (tuple-wrapped) keeps the conditional non-distributive
  // so a union body type (e.g. a discriminated `BlockOp`) stays one `body: TBody`
  // requirement instead of distributing into `{body: A} | {body: B} | …`, which
  // would reject the whole-union value.
} & ([TBody] extends [void] ? { body?: never } : { body: TBody }) &
  ([TQuery] extends [void] ? { query?: never } : { query: TQuery });

/**
 * Typed fetch wrapper for endpoint definitions.
 *
 * - Interpolates params into the URL
 * - Appends query params if query schema exists
 * - JSON-serializes body for mutation methods
 * - Parses response through responseSchema if provided
 * - Throws EndpointError on non-2xx
 */
export async function fetchEndpoint<
  Route extends string,
  TParams,
  TBody,
  TResponse,
  TQuery,
>(
  endpoint: EndpointDef<Route, TParams, TBody, TResponse, TQuery>,
  params: TParams,
  opts?: FetchOpts<TBody, TQuery>,
): Promise<TResponse extends void ? void : TResponse> {
  const method = extractMethod(endpoint.route);
  let url = interpolatePath(
    endpoint.path,
    (params ?? {}) as Record<string, string>,
  );

  // Append query params
  if (opts && "query" in opts && opts.query != null) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(
      opts.query as Record<string, unknown>,
    )) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  // Content-type comes only from the codec — no application/json fallback, so
  // multipart stays header-less (the browser sets the boundary).
  let body: BodyInit | undefined;
  if (endpoint.bodyCodec && opts && "body" in opts && opts.body !== undefined) {
    const enc = endpoint.bodyCodec.encodeRequest(opts.body);
    body = enc.body;
    if (enc.contentType) headers["Content-Type"] = enc.contentType;
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    signal: opts?.signal,
    keepalive: opts?.keepalive,
  });

  if (!res.ok) {
    // Read the body ONCE, as text, then upgrade to JSON if it parses.
    //
    // The reverse order silently destroys plain-text errors: `res.json()`
    // disturbs the body, so the `res.text()` in its catch throws "Body already
    // used" and yields null. Every `HttpError(400, "…")` in the repo — which
    // serializes as plain text — therefore arrived here as a null body and was
    // rendered as the useless "HTTP 400".
    const rawBody = await res.text().catch(() => null);
    let errorBody: unknown = rawBody;
    if (rawBody) {
      try {
        errorBody = JSON.parse(rawBody);
      } catch (err) {
        if (!(err instanceof SyntaxError)) throw err;
        // Not JSON — keep the text, which is exactly what HttpError sends.
      }
    }
    if (opts?.report !== false) {
      endpointErrorSink.emit({ route: endpoint.route, status: res.status, body: errorBody });
    }
    throw new EndpointError(res.status, errorBody);
  }

  // void response (204 or no response codec)
  if (res.status === 204 || !endpoint.responseCodec) {
    return undefined as TResponse extends void ? void : TResponse;
  }

  const parsed = await endpoint.responseCodec.decodeResponse(res);
  return parsed as TResponse extends void ? void : TResponse;
}

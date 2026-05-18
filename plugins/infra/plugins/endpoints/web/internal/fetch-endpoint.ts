import type { EndpointDef } from "../../core/define-endpoint";
import { extractMethod, interpolatePath } from "../../core/route-params";

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

type FetchOpts<TBody, TQuery> = { signal?: AbortSignal } & (TBody extends void
  ? { body?: never }
  : { body: TBody }) &
  (TQuery extends void ? { query?: never } : { query: TQuery });

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
  let body: string | undefined;
  if (opts && "body" in opts && opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    signal: opts?.signal,
  });

  if (!res.ok) {
    let errorBody: unknown;
    try {
      errorBody = await res.json();
    } catch {
      errorBody = await res.text().catch(() => null);
    }
    throw new EndpointError(res.status, errorBody);
  }

  // void response (204 or no responseSchema)
  if (res.status === 204 || !endpoint.responseSchema) {
    return undefined as TResponse extends void ? void : TResponse;
  }

  const json: unknown = await res.json();
  const parsed = endpoint.responseSchema.parse(json);
  return parsed as TResponse extends void ? void : TResponse;
}

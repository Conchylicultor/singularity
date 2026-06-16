import { recordEntrySpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { createInflight } from "@plugins/packages/plugins/inflight/core";
import type { EndpointDef } from "./define-endpoint";
import { HttpError } from "./http-error";

export { HttpError };

type HttpHandler = (
  req: Request,
  params: Record<string, string>,
) => Response | Promise<Response>;

// Widen string types recursively so handlers can return:
// - Drizzle `timestamp` columns (Date) where the Zod schema says string
// - Rank class objects where the schema says string (toJSON serialises them)
// - Plain strings where the schema infers a branded string
// Response.json() serialises all of these correctly on the wire.
type JsonSerializable = { toJSON(): string; toString(): string };
type JsonCompat<T> =
  T extends string ? string | Date | JsonSerializable :
  T extends Blob | ArrayBuffer | ArrayBufferView | FormData | ReadableStream ? T :
  T extends (infer U)[] ? JsonCompat<U>[] :
  T extends object ? { [K in keyof T]: JsonCompat<T[K]> } :
  T;

export function implement<
  Route extends string,
  TParams,
  TBody,
  TResponse,
  TQuery,
>(
  _endpoint: EndpointDef<Route, TParams, TBody, TResponse, TQuery>,
  handler: (ctx: {
    params: TParams;
    body: TBody;
    query: TQuery;
    req: Request;
  }) => Promise<JsonCompat<TResponse>> | JsonCompat<TResponse>,
): HttpHandler {
  // Per-route gates, built once at registration. `concurrency` caps how many
  // handler bodies run at once (e.g. routes that spawn git/tar subprocesses, so
  // a burst can't saturate the box); `dedupe` collapses concurrent identical
  // GETs onto one in-flight handler. See
  // research/2026-06-15-global-live-state-cascade-contention.md (Change 5).
  const gate = _endpoint.concurrency ? createSemaphore(_endpoint.concurrency) : null;
  const dedupe = _endpoint.dedupe ? createInflight() : null;
  if (dedupe && _endpoint.method !== "GET") {
    // Fail loudly at boot: deduping a mutation would silently drop a caller's
    // distinct side effect.
    throw new Error(
      `implement(${_endpoint.route}): dedupe is only valid on GET endpoints`,
    );
  }
  return async (req: Request, params: Record<string, string>) => {
    try {
      // Decode body via codec if one exists. The codec throws HttpError(400)
      // on a bad payload, handled by the catch below.
      let body: TBody = undefined as TBody;
      if (_endpoint.bodyCodec) {
        body = await _endpoint.bodyCodec.decodeRequest(req);
      }

      // Parse query if schema exists
      let query: TQuery = undefined as TQuery;
      if (_endpoint.querySchema) {
        const url = new URL(req.url, "http://localhost");
        const raw: Record<string, string> = {};
        for (const [key, value] of url.searchParams.entries()) {
          raw[key] = value;
        }
        const result = _endpoint.querySchema.safeParse(raw);
        if (!result.success) {
          return Response.json(
            { error: "Query validation failed", issues: result.error.issues },
            { status: 400 },
          );
        }
        query = result.data;
      }

      // Records an `http` span and establishes the ambient parent context so
      // nested DB/loader spans attribute to this route. Records in `finally`,
      // so a throwing handler's duration is captured too.
      const runHandler = async (): Promise<JsonCompat<TResponse>> =>
        recordEntrySpan("http", _endpoint.route, () =>
          handler({
            params: params as TParams,
            body,
            query,
            req,
          }),
        );

      // dedupe (outermost, so duplicates never even take a concurrency slot) →
      // concurrency gate → handler. Deduped callers share one `result` object
      // (read-only JSON-safe data) and each encodes its own Response below.
      const gated = gate ? () => gate.run(runHandler) : runHandler;
      const result = dedupe
        ? await dedupe.run(dedupeKey(req), gated)
        : await gated();

      // void/undefined/null → 204
      if (result === undefined || result === null) {
        return new Response(null, { status: 204 });
      }

      return _endpoint.responseCodec
        ? _endpoint.responseCodec.encodeResponse(result as TResponse)
        : Response.json(result);
    } catch (err) {
      if (err instanceof HttpError) {
        return new Response(err.message, { status: err.status });
      }
      throw err;
    }
  };
}

// Identity of a GET for dedup: method + path + query string. Two requests with
// the same key request the same bytes, so they can share one handler run.
function dedupeKey(req: Request): string {
  const url = new URL(req.url, "http://localhost");
  return `${req.method} ${url.pathname}${url.search}`;
}

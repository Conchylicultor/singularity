import { recordEntrySpan } from "@plugins/infra/plugins/runtime-profiler/core";
import type { EndpointDef } from "./define-endpoint";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
  }
}

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
  return async (req: Request, params: Record<string, string>) => {
    try {
      // Parse body if schema exists
      let body: TBody = undefined as TBody;
      if (_endpoint.bodySchema) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        const result = _endpoint.bodySchema.safeParse(raw);
        if (!result.success) {
          return Response.json(
            { error: "Validation failed", issues: result.error.issues },
            { status: 400 },
          );
        }
        body = result.data;
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
      const result = await recordEntrySpan("http", _endpoint.route, () =>
        handler({
          params: params as TParams,
          body,
          query,
          req,
        }),
      );

      // void/undefined/null → 204
      if (result === undefined || result === null) {
        return new Response(null, { status: 204 });
      }

      return Response.json(result);
    } catch (err) {
      if (err instanceof HttpError) {
        return new Response(err.message, { status: err.status });
      }
      throw err;
    }
  };
}

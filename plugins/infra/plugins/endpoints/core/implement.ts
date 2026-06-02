import { recordSpan } from "@plugins/infra/plugins/runtime-profiler/core";
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

type ImplementReturn<T> = [T] extends [void] ? unknown : T;

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
  }) => Promise<ImplementReturn<TResponse>> | ImplementReturn<TResponse>,
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

      const t0 = performance.now();
      const result = await handler({
        params: params as TParams,
        body,
        query,
        req,
      });
      recordSpan("http", _endpoint.route, performance.now() - t0);

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

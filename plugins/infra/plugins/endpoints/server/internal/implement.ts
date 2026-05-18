import type { HttpHandler } from "@server/types";
import type { EndpointDef } from "../../core/define-endpoint";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
  }
}

/**
 * Wraps a typed handler into a standard HttpHandler.
 *
 * - Validates body via bodySchema (400 on failure)
 * - Validates query via querySchema (400 on failure)
 * - Serializes return value to Response.json() (or 204 for void)
 * - Catches HttpError and returns the appropriate status
 */
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
  }) => Promise<TResponse> | TResponse,
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

      const result = await handler({
        params: params as TParams,
        body,
        query,
        req,
      });

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

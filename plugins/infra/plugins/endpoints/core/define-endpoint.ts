import type { ZodType } from "zod";
import type { ExtractParams } from "./route-params";
import { extractMethod, extractPath } from "./route-params";

export interface EndpointDef<
  Route extends string,
  TParams,
  TBody,
  TResponse,
  TQuery,
> {
  readonly route: Route;
  readonly method: string;
  readonly path: string;
  readonly bodySchema?: ZodType<TBody>;
  readonly responseSchema?: ZodType<TResponse>;
  readonly querySchema?: ZodType<TQuery>;
  /** Phantom field to carry the params type. Never set at runtime. */
  readonly __params?: TParams;
}

export function defineEndpoint<
  const Route extends string,
  TBody = void,
  TResponse = void,
  TQuery = void,
>(opts: {
  route: Route;
  body?: ZodType<TBody>;
  response?: ZodType<TResponse>;
  query?: ZodType<TQuery>;
}): EndpointDef<Route, ExtractParams<Route>, TBody, TResponse, TQuery> {
  return {
    route: opts.route,
    method: extractMethod(opts.route),
    path: extractPath(opts.route),
    bodySchema: opts.body,
    responseSchema: opts.response,
    querySchema: opts.query,
  };
}

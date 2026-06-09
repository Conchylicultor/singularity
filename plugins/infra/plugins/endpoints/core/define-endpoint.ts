import type { ZodType } from "zod";
import { type Codec, isCodec, json } from "./codec";
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
  readonly bodyCodec?: Codec<TBody>;
  readonly responseCodec?: Codec<TResponse>;
  readonly querySchema?: ZodType<TQuery>;
  /** Phantom field to carry the params type. Never set at runtime. */
  readonly __params?: TParams;
}

/** A body/response spec accepts a bare Zod schema (JSON) or an explicit codec. */
type Spec<T> = ZodType<T> | Codec<T>;

/**
 * Extracts the payload type from a spec. Inferring `B`/`R` as the *spec object*
 * type and extracting via this conditional avoids the union-variance inference
 * regression a direct `ZodType<T> | Codec<T>` parameter would cause (`Codec<T>`
 * is invariant in `T`).
 */
type SpecType<S> = S extends Codec<infer U>
  ? U
  : S extends ZodType<infer U>
    ? U
    : void;

export function defineEndpoint<
  const Route extends string,
  B extends Spec<unknown> = Spec<void>,
  R extends Spec<unknown> = Spec<void>,
  TQuery = void,
>(opts: {
  route: Route;
  body?: B;
  response?: R;
  query?: ZodType<TQuery>;
}): EndpointDef<Route, ExtractParams<Route>, SpecType<B>, SpecType<R>, TQuery> {
  const bodyCodec = opts.body
    ? isCodec(opts.body)
      ? opts.body
      : json(opts.body as ZodType)
    : undefined;
  const responseCodec = opts.response
    ? isCodec(opts.response)
      ? opts.response
      : json(opts.response as ZodType)
    : undefined;
  return {
    route: opts.route,
    method: extractMethod(opts.route),
    path: extractPath(opts.route),
    bodyCodec: bodyCodec as Codec<SpecType<B>> | undefined,
    responseCodec: responseCodec as Codec<SpecType<R>> | undefined,
    querySchema: opts.query,
  };
}

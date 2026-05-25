import type { ZodTypeAny, z } from "zod";

export interface BlockHandle<T> {
  type: string;
  schema: ZodTypeAny;
  parse(data: unknown): T;
}

export function defineBlock<S extends ZodTypeAny>(opts: {
  type: string;
  schema: S;
}): BlockHandle<z.infer<S>> {
  return {
    type: opts.type,
    schema: opts.schema,
    parse: (data) => opts.schema.parse(data),
  };
}

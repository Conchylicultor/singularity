import type { ComponentType } from "react";
import type { ZodTypeAny, z } from "zod";

export interface BlockHandle<T> {
  type: string;
  schema: ZodTypeAny;
  parse(data: unknown): T;
  /**
   * Optional insert-menu label (e.g. "Text", "Link to page"). A block type
   * without a `label` is not offered in the editor's "add block" menu.
   */
  label?: string;
  /** Optional insert-menu icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Returns the default `data` payload for a freshly inserted block. */
  empty?: () => T;
}

export function defineBlock<S extends ZodTypeAny>(opts: {
  type: string;
  schema: S;
  label?: string;
  icon?: ComponentType<{ className?: string }>;
  empty?: () => z.infer<S>;
}): BlockHandle<z.infer<S>> {
  return {
    type: opts.type,
    schema: opts.schema,
    parse: (data) => opts.schema.parse(data),
    label: opts.label,
    icon: opts.icon,
    empty: opts.empty,
  };
}

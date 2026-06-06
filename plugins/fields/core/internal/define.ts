import type { FieldIdentity, FieldType } from "./types";

export function defineFieldType<T>(id: string): FieldType<T> {
  return Object.freeze({ id });
}

export function defineFieldIdentity<T>(
  identity: FieldIdentity<T>,
): FieldIdentity<T> {
  return Object.freeze(identity);
}

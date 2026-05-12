export interface TokenGroupField {
  default: string;
  label?: string;
}

export type TokenGroupSchema = Record<string, TokenGroupField>;

export interface TokenGroupDescriptor<
  T extends TokenGroupSchema = TokenGroupSchema,
> {
  id: string;
  schema: T;
  vars: { [K in keyof T]: string };
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function defineTokenGroup<T extends TokenGroupSchema>(
  id: string,
  schema: T,
): TokenGroupDescriptor<T> {
  const vars = {} as Record<string, string>;
  for (const key of Object.keys(schema)) {
    vars[key] = `--${camelToKebab(key)}`;
  }
  return { id, schema, vars: vars as { [K in keyof T]: string } };
}

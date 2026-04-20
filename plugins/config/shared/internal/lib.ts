// Plugin-facing API for declaring config values. One `defineConfig` call per
// plugin; each property is a field. Types are inferred from defaults.

export type FieldMeta<T> = {
  default: T;
  description?: string;
  /** Override the auto-derived label (camelCase → sentence case). */
  label?: string;
};

export type Field<T = unknown> = T | FieldMeta<T>;

export type Schema = Record<string, Field>;

export type ValueOf<F> = F extends FieldMeta<infer T> ? T : F;

export type Values<S extends Schema> = { [K in keyof S]: ValueOf<S[K]> };

export type FieldKind = "string" | "number" | "boolean" | "string-list";

export interface NormalizedField {
  key: string;
  label: string;
  description?: string;
  kind: FieldKind;
  default: unknown;
}

export interface ConfigDescriptor<S extends Schema = Schema> {
  schema: S;
  /** Phantom — never read at runtime, drives type inference in read helpers. */
  readonly __values?: Values<S>;
}

export function defineConfig<const S extends Schema>(schema: S): ConfigDescriptor<S> {
  for (const key of Object.keys(schema)) {
    if (key.includes(".")) {
      throw new Error(
        `defineConfig: field name "${key}" must not contain "." (used as key separator).`,
      );
    }
  }
  return { schema };
}

function isFieldMeta(v: unknown): v is FieldMeta<unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "default" in (v as Record<string, unknown>)
  );
}

export function getDefault(field: Field): unknown {
  return isFieldMeta(field) ? field.default : field;
}

export function kindOf(value: unknown): FieldKind | null {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return "string-list";
  }
  return null;
}

function toLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Normalize a schema into a list of fields with concrete kinds + labels.
 * Fields with unsupported default types (e.g. `default: null`) are dropped and
 * a warning is printed.
 */
export function normalize(schema: Schema): NormalizedField[] {
  const out: NormalizedField[] = [];
  for (const [key, raw] of Object.entries(schema)) {
    const meta: FieldMeta<unknown> = isFieldMeta(raw)
      ? (raw as FieldMeta<unknown>)
      : { default: raw };
    const kind = kindOf(meta.default);
    if (!kind) {
      // biome-ignore lint/suspicious/noConsole: surface skipped fields during boot.
      console.warn(
        `[config] skipping field "${key}": unsupported default type (${typeof meta.default}). Use string, number, boolean, or string[] — or cast with "as string[]".`,
      );
      continue;
    }
    out.push({
      key,
      label: meta.label ?? toLabel(key),
      description: meta.description,
      kind,
      default: meta.default,
    });
  }
  return out;
}

export function fullKey(pluginId: string, fieldKey: string): string {
  return `${pluginId}.${fieldKey}`;
}

/**
 * Normalize textarea input for string-list fields: trim each line, drop empty
 * lines, dedupe preserving first-seen order.
 */
export function normalizeStringList(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function validateKind(kind: FieldKind, value: unknown): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string-list":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
  }
}

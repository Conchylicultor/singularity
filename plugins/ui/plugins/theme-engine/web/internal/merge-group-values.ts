import type { TokenGroupSchema } from "../../core";

/**
 * Merge a token group's values for both color modes.
 *
 * The schema defaults are the base layer — a preset is a sparse override
 * layered on top, and config overrides win above that. This guarantees every
 * declared token var resolves even for sparse presets (e.g. tweakcn imports
 * that only carry colors): holes fall through to the schema default rather
 * than vanishing.
 *
 * Only non-empty (`!== ""`) override values are applied, matching the prior
 * injector semantics.
 */
export function mergeGroupValues(
  schema: TokenGroupSchema,
  active: { light: Record<string, string>; dark: Record<string, string> },
  overrides: { light?: Record<string, string>; dark?: Record<string, string> },
): { light: Record<string, string>; dark: Record<string, string> } {
  const schemaDefaults: Record<string, string> = {};
  for (const [k, field] of Object.entries(schema)) {
    schemaDefaults[k] = field.default;
  }

  const light = { ...schemaDefaults, ...active.light };
  const dark = { ...schemaDefaults, ...active.dark };

  for (const [k, v] of Object.entries(overrides.light ?? {})) {
    if (v !== "") light[k] = v;
  }
  for (const [k, v] of Object.entries(overrides.dark ?? {})) {
    if (v !== "") dark[k] = v;
  }

  return { light, dark };
}

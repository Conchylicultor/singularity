import type { TokenGroupSchema } from "./define-token-group";

/**
 * Merge a token group's values for both color modes.
 *
 * The schema defaults are the base layer — a preset is a sparse override
 * layered on top, and config overrides win above that. This guarantees every
 * declared token var resolves even for sparse presets (e.g. tweakcn imports
 * that only carry colors): holes fall through to the schema default rather
 * than vanishing.
 *
 * The dark base is each field's `darkDefault` where it declares one, else its
 * `default` — so a group no theme mentions still paints its dark colours on a
 * dark page.
 *
 * Only non-empty (`!== ""`) override values are applied, matching the prior
 * injector semantics.
 */
export function mergeGroupValues(
  schema: TokenGroupSchema,
  active: { light: Record<string, string>; dark: Record<string, string> },
  overrides: { light?: Record<string, string>; dark?: Record<string, string> },
): { light: Record<string, string>; dark: Record<string, string> } {
  const lightDefaults: Record<string, string> = {};
  const darkDefaults: Record<string, string> = {};
  for (const [k, field] of Object.entries(schema)) {
    lightDefaults[k] = field.default;
    darkDefaults[k] = field.darkDefault ?? field.default;
  }

  const light = { ...lightDefaults, ...active.light };
  const dark = { ...darkDefaults, ...active.dark };

  for (const [k, v] of Object.entries(overrides.light ?? {})) {
    if (v !== "") light[k] = v;
  }
  for (const [k, v] of Object.entries(overrides.dark ?? {})) {
    if (v !== "") dark[k] = v;
  }

  return { light, dark };
}

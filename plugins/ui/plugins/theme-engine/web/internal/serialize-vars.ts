// Pure serialization of a token group's resolved values into the
// `:root{…}.dark{…}` CSS text that ThemeInjector injects per group. Extracted so
// the runtime injector and the localStorage critical-css cache (replayed verbatim
// by the pre-paint script before first paint) produce byte-identical text from
// ONE function — the warm-reload no-flash guarantee depends on that identity.

type VarsDescriptor = { vars: Record<string, string> };

/** Serialize a value map into `  --css-var: value;` lines, skipping unknown keys. */
export function buildVarsBlock(
  descriptor: VarsDescriptor,
  values: Record<string, string>,
): string {
  return Object.entries(values)
    .map(([key, value]) => {
      const cssVar = descriptor.vars[key];
      if (!cssVar) return null;
      return `  ${cssVar}: ${value};`;
    })
    .filter(Boolean)
    .join("\n");
}

/** The full `:root{…}.dark{…}` block for one token group, given resolved values. */
export function renderGroupBlock(
  descriptor: VarsDescriptor,
  light: Record<string, string>,
  dark: Record<string, string>,
): string {
  return `:root {\n${buildVarsBlock(descriptor, light)}\n}\n.dark {\n${buildVarsBlock(descriptor, dark)}\n}`;
}

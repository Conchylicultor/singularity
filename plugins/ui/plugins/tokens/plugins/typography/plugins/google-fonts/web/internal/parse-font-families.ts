const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "-apple-system",
  "BlinkMacSystemFont",
]);

export function parseFontFamilies(cssFontFamily: string): string[] {
  return cssFontFamily
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter((s) => s !== "" && !GENERIC_FAMILIES.has(s));
}

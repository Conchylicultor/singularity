/**
 * Pure, dependency-free templating helpers shared by workflow step executors.
 *
 * `getByPath` reads a dot-path into a value (typically the previous step's
 * output); `interpolate` renders a string by substituting every `{{ expr }}`
 * token.
 */

export function getByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== "object" || obj === null) return undefined;
  return path.split(".").reduce<unknown>((cur, key) => {
    if (typeof cur === "object" && cur !== null) {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function interpolate(template: string, input: unknown): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr: string) => {
    const value = expr === "." ? input : getByPath(input, expr);
    return stringify(value);
  });
}

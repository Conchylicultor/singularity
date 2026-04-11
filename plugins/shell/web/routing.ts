export function matchRoute(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const normalize = (p: string) => (p === "/" ? p : p.replace(/\/$/, ""));
  const patternParts = normalize(pattern).split("/");
  const pathParts = normalize(pathname).split("/");
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i]!.startsWith(":")) {
      params[patternParts[i]!.slice(1)] = decodeURIComponent(pathParts[i]!);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

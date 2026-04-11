export function matchRoute(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.replace(/\/$/, "").split("/");
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

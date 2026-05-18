/**
 * Template literal type that infers route params from a route string.
 *
 * "GET /api/agents/:id"       → { id: string }
 * "GET /api/agents/:id/launches" → { id: string }
 * "GET /api/agents"           → Record<string, never>
 */

type ExtractParamKeys<S extends string> =
  S extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractParamKeys<Rest>
    : S extends `${string}:${infer Param}`
      ? Param
      : never;

export type ExtractParams<Route extends string> =
  ExtractParamKeys<Route> extends never
    ? Record<string, never>
    : { [K in ExtractParamKeys<Route>]: string };

/**
 * Extract the HTTP method from a route string.
 * "GET /api/agents/:id" → "GET"
 */
export function extractMethod(route: string): string {
  return route.split(" ", 1)[0]!;
}

/**
 * Extract the path template from a route string.
 * "GET /api/agents/:id" → "/api/agents/:id"
 */
export function extractPath(route: string): string {
  const spaceIdx = route.indexOf(" ");
  return spaceIdx === -1 ? route : route.slice(spaceIdx + 1);
}

/**
 * Interpolate params into a path template.
 * interpolatePath("/api/agents/:id", { id: "abc" }) → "/api/agents/abc"
 */
export function interpolatePath(
  template: string,
  params: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, encodeURIComponent(value));
  }
  return result;
}

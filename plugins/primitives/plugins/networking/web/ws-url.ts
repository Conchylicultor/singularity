/**
 * Absolute `ws(s)://` URL for a same-origin socket path.
 *
 * A function, deliberately — not a module-scope `const`. Deriving the URL at
 * module evaluation time (`const WS_URL = \`…${window.location.host}…\``) makes
 * the *importing* module unloadable in any runtime without a DOM: `bun test`
 * and the docgen barrel walk both throw `ReferenceError: window is not defined`
 * on import, long before the component that wanted the socket ever renders.
 * That is what the `dom-access-safety/no-module-scope-dom` lint rule enforces;
 * this helper is the sanctioned way to satisfy it.
 *
 * Call it where the URL is consumed (render body, effect, event handler). The
 * returned string is identical every call, so it is safe as an effect dep.
 */
export function wsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

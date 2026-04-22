// Only plugin code is considered routine — everything else gets a warning.
const SAFE_PREFIXES = ["plugins/", "docs/", "e2e/", "research/", "sidequests/", "bun.lock"];

export function isCoreFile(path: string): boolean {
  return !SAFE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

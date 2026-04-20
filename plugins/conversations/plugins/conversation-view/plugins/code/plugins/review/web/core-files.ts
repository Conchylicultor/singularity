// Paths that are load-bearing infrastructure — reviewers should apply extra care.
const CORE_PREFIXES = ["cli/", "plugin-core/", "server/", "gateway/"];

export function isCoreFile(path: string): boolean {
  return CORE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

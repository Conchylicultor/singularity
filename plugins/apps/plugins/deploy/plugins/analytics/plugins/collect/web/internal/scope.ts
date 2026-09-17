/** Whether `path` is the app's base path or one of its sub-paths. */
export function isWithinApp(path: string, basePath: string): boolean {
  const base = basePath.replace(/\/+$/, "");
  if (base === "") return true;
  return path === base || path.startsWith(`${base}/`);
}

export type FileWarningLevel = "safe" | "careful" | "critical";

export function getFileWarningLevel(
  path: string,
  safePaths: string[],
  carefulPaths: string[],
): FileWarningLevel {
  if (safePaths.some((prefix) => path.startsWith(prefix))) return "safe";
  if (carefulPaths.some((prefix) => path.startsWith(prefix))) return "careful";
  return "critical";
}

export type ExportRuntime = "web" | "server" | "central" | "core" | "shared";

/**
 * Canonical categorical-palette classes for each plugin runtime.
 * Pill-style (bg tint + text color) — used by both the runtimes pill section
 * and the public-api runtime-group label.
 */
export const RUNTIME_COLORS: Record<ExportRuntime, string> = {
  web: "bg-categorical-1/10 text-categorical-1",
  server: "bg-categorical-2/10 text-categorical-2",
  central: "bg-categorical-5/10 text-categorical-5",
  core: "bg-categorical-3/10 text-categorical-3",
  shared: "bg-categorical-9/10 text-categorical-9",
};

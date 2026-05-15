import { defineStepExecutor } from "@plugins/apps/plugins/workflows/plugins/engine/server";

function getByDotPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== "object" || obj === null) return undefined;
  return path.split(".").reduce<unknown>((cur, key) => {
    if (typeof cur === "object" && cur !== null) {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const branchExecutor = defineStepExecutor({
  pluginId: "branch",
  async run({ step }) {
    const config = step.config as { field: string; defaultBranch?: string };
    const value = getByDotPath(step.input, config.field);
    const branchKey =
      value != null ? String(value) : (config.defaultBranch ?? undefined);
    return { branchKey };
  },
});

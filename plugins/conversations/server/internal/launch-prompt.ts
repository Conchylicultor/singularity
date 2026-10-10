import { buildTaskPrompt } from "@plugins/tasks/plugins/tasks-core/core";

type PromptTask = Parameters<typeof buildTaskPrompt>[0];

/**
 * The prompt an armed task launches with, most specific first: the one the
 * launching caller holds (`explicit` — a user's inline launch), else the one
 * stored on the marker by whoever armed it (`armed` — an automation's filled
 * template), else the task's own text. The task is read only when neither
 * says (`readTask`).
 */
export async function resolveLaunchPrompt(args: {
  explicit: string | undefined;
  armed: string | null;
  readTask: () => Promise<PromptTask>;
}): Promise<string> {
  if (args.explicit !== undefined) return args.explicit;
  if (args.armed !== null) return args.armed;
  return buildTaskPrompt(await args.readTask());
}
